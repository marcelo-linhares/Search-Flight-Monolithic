'use strict';

/**
 * RemoteEventBridge: carries chosen domain events from one process to another
 * (the transport that replaces the in-process bus when a context is extracted).
 *
 * Contract (at-least-once delivery, so the receiver must tolerate duplicates):
 *  - forwards ONLY the configured event types, in order;
 *  - retries transient failures (network error, 5xx, 408, 429) with backoff;
 *  - dead-letters permanent failures (other 4xx) and exhausted retries;
 *  - the receiver ignores an event it already processed (by eventId);
 *  - an event that arrived from the peer is never forwarded back (no loops);
 *  - the receiver authenticates the sender with a shared token.
 */

const { InProcessEventBus } = require('../../../src/shared/in-process-event-bus');
const { RemoteEventBridge } = require('../../../src/shared/remote-event-bridge');

const noSleep = async () => {};

// A fake network: calls `receiver.receive(event, token)` like the HTTP route would.
function wire({ sender, receiver, failures = [] }) {
  const attempts = [];
  const fetchImpl = async (url, init) => {
    attempts.push(url);
    const failure = failures.shift();
    if (failure === 'network') throw new Error('ECONNREFUSED');
    if (typeof failure === 'number') return { ok: false, status: failure };
    const body = JSON.parse(init.body);
    const result = await receiver.receive(body, init.headers['x-internal-token']);
    return { ok: result.status !== 'unauthorized', status: result.status === 'unauthorized' ? 401 : 202 };
  };
  return { fetchImpl, attempts };
}

function pair({ failures = [], senderOptions = {}, receiverOptions = {} } = {}) {
  const senderBus = new InProcessEventBus();
  const receiverBus = new InProcessEventBus();
  const receiver = new RemoteEventBridge({ localBus: receiverBus, token: 's3cret', ...receiverOptions });
  const net = wire({ sender: null, receiver, failures });
  const sender = new RemoteEventBridge({
    localBus: senderBus, peerUrl: 'http://peer', token: 's3cret', forwardTypes: ['Ping'],
    fetchImpl: net.fetchImpl, sleep: noSleep, logger: { warn() {}, error() {} }, ...senderOptions,
  });
  sender.start();
  return { senderBus, receiverBus, sender, receiver, net };
}

describe('RemoteEventBridge', () => {
  it('forwards a configured event type to the peer, which publishes it on its own bus', async () => {
    const { senderBus, receiverBus, sender } = pair();
    const seen = [];
    receiverBus.subscribe('Ping', (e) => seen.push(e));

    await senderBus.publish({ type: 'Ping', eventId: 'e-1', userId: 'u-1' });
    await sender.idle();

    expect(seen).toMatchObject([{ type: 'Ping', eventId: 'e-1', userId: 'u-1' }]);
    expect(sender.stats.sent).toBe(1);
  });

  it('does not forward event types that are not configured', async () => {
    const { senderBus, receiverBus, sender, net } = pair();
    const seen = [];
    receiverBus.subscribe('Other', (e) => seen.push(e));

    await senderBus.publish({ type: 'Other', eventId: 'e-1' });
    await sender.idle();

    expect(seen).toEqual([]);
    expect(net.attempts).toEqual([]);
  });

  it('keeps the order of events', async () => {
    const { senderBus, receiverBus, sender } = pair();
    const seen = [];
    receiverBus.subscribe('Ping', (e) => seen.push(e.n));

    for (let n = 1; n <= 5; n += 1) await senderBus.publish({ type: 'Ping', eventId: `e-${n}`, n });
    await sender.idle();

    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('assigns an eventId when the producer did not (so duplicates can be detected)', async () => {
    const { senderBus, receiverBus, sender } = pair();
    const seen = [];
    receiverBus.subscribe('Ping', (e) => seen.push(e));

    await senderBus.publish({ type: 'Ping', userId: 'u-1' });
    await sender.idle();

    expect(typeof seen[0].eventId).toBe('string');
  });

  it.each([['network error', 'network'], ['HTTP 503', 503], ['HTTP 429', 429]])(
    'retries a transient failure (%s) and then delivers',
    async (_label, failure) => {
      const { senderBus, receiverBus, sender, net } = pair({ failures: [failure, failure] });
      const seen = [];
      receiverBus.subscribe('Ping', (e) => seen.push(e));

      await senderBus.publish({ type: 'Ping', eventId: 'e-1' });
      await sender.idle();

      expect(net.attempts).toHaveLength(3);
      expect(seen).toHaveLength(1);
      expect(sender.stats.deadLetters).toEqual([]);
    },
  );

  it('dead-letters an event after the retries are exhausted, and keeps delivering the next ones', async () => {
    const { senderBus, receiverBus, sender } = pair({
      failures: ['network', 'network', 'network'],
      senderOptions: { retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 } },
    });
    const seen = [];
    receiverBus.subscribe('Ping', (e) => seen.push(e.eventId));

    await senderBus.publish({ type: 'Ping', eventId: 'lost' });
    await senderBus.publish({ type: 'Ping', eventId: 'next' });
    await sender.idle();

    expect(sender.stats.deadLetters.map((d) => d.event.eventId)).toEqual(['lost']);
    expect(seen).toEqual(['next']);
  });

  it('dead-letters at once on a permanent failure (HTTP 400): no retry', async () => {
    const { senderBus, sender, net } = pair({ failures: [400] });

    await senderBus.publish({ type: 'Ping', eventId: 'e-1' });
    await sender.idle();

    expect(net.attempts).toHaveLength(1);
    expect(sender.stats.deadLetters).toHaveLength(1);
  });

  it('receiver ignores a redelivered event (same eventId) and reports it as a duplicate', async () => {
    const { receiver, receiverBus } = pair();
    const seen = [];
    receiverBus.subscribe('Ping', (e) => seen.push(e));
    const event = { type: 'Ping', eventId: 'e-1' };

    expect((await receiver.receive(event, 's3cret')).status).toBe('accepted');
    expect((await receiver.receive(event, 's3cret')).status).toBe('duplicate');

    expect(seen).toHaveLength(1);
    expect(receiver.stats.duplicatesIgnored).toBe(1);
  });

  it('a failing handler on the receiver does NOT mark the event as processed (a retry can succeed)', async () => {
    const { receiver, receiverBus } = pair();
    let fail = true;
    receiverBus.subscribe('Ping', () => { if (fail) throw new Error('boom'); });
    const event = { type: 'Ping', eventId: 'e-1' };

    await expect(receiver.receive(event, 's3cret')).rejects.toThrow();
    fail = false;

    expect((await receiver.receive(event, 's3cret')).status).toBe('accepted');
  });

  it('rejects a sender with the wrong token and publishes nothing', async () => {
    const { receiver, receiverBus } = pair();
    const seen = [];
    receiverBus.subscribe('Ping', (e) => seen.push(e));

    const result = await receiver.receive({ type: 'Ping', eventId: 'e-1' }, 'wrong');

    expect(result.status).toBe('unauthorized');
    expect(seen).toEqual([]);
  });

  it('never forwards back an event that came from the peer (no loops)', async () => {
    const bus = new InProcessEventBus();
    const attempts = [];
    const bridge = new RemoteEventBridge({
      localBus: bus, peerUrl: 'http://peer', forwardTypes: ['Ping'],
      fetchImpl: async (url) => { attempts.push(url); return { ok: true, status: 202 }; },
      sleep: noSleep,
    });
    bridge.start();

    await bridge.receive({ type: 'Ping', eventId: 'e-1' });
    await bridge.idle();

    expect(attempts).toEqual([]);
  });

  it('rejects an event without a type', async () => {
    const { receiver } = pair();

    await expect(receiver.receive({ eventId: 'x' }, 's3cret')).rejects.toThrow(/type/);
  });
});
