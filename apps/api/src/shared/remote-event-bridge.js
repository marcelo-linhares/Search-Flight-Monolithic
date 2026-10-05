'use strict';

// ─────────────────────────────────────────────
//  RemoteEventBridge (shared kernel: transport only, no domain concepts)
//
//  When a context runs in its own process, the in-process bus no longer reaches
//  it. The bridge carries the events that must cross the process boundary over
//  HTTP, and keeps the same contract for handlers: publish(event) / subscribe(type).
//
//    local bus ──(forwardTypes)──> outbox ──POST──> peer /internal/events ──> peer bus
//
//  Guarantees (deliberately modest, same as a simple queue):
//   - at-least-once delivery, in order, with retries and backoff for transient failures
//   - the receiver de-duplicates by eventId, so redelivery is safe
//   - permanent failures go to a dead-letter list instead of blocking the line
//   - NOT atomic with the producer's database write (no outbox table yet):
//     a crash between save() and enqueue loses the event. See docs/EXPERIMENT_REFACTORING.md.
// ─────────────────────────────────────────────

const { randomUUID } = require('crypto');

const TRANSIENT_STATUS = new Set([408, 425, 429]);
const MAX_REMEMBERED_EVENT_IDS = 10000;

class RemoteEventBridge {
  #queue = [];
  #draining = null;
  #processed = new Set();

  constructor({
    localBus,
    peerUrl = null,
    forwardTypes = [],
    token = null,
    fetchImpl = globalThis.fetch,
    retry = {},
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    logger = console,
  }) {
    this.localBus     = localBus;
    this.peerUrl      = peerUrl;
    this.forwardTypes = [...forwardTypes];
    this.token        = token;
    this.fetchImpl    = fetchImpl;
    this.retry        = { attempts: 5, baseDelayMs: 50, maxDelayMs: 2000, ...retry };
    this.sleep        = sleep;
    this.logger       = logger;
    this.stats        = { sent: 0, duplicatesIgnored: 0, deadLetters: [] };
  }

  // Subscribes to the event types this process PRODUCES for the peer.
  start() {
    this.forwardTypes.forEach((type) => {
      this.localBus.subscribe(type, (event) => this.#enqueue(event));
    });
    return this;
  }

  #enqueue(event) {
    if (event.__remote) return; // came from the peer: never send it back
    const withId = event.eventId ? event : { ...event, eventId: randomUUID() };
    this.#queue.push(withId);
    if (!this.#draining) this.#draining = this.#drain();
  }

  async #drain() {
    try {
      while (this.#queue.length > 0) {
        const event = this.#queue.shift();
        await this.#deliver(event);
      }
    } finally {
      this.#draining = null;
    }
  }

  async #deliver(event) {
    const { attempts, baseDelayMs, maxDelayMs } = this.retry;
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const res = await this.fetchImpl(`${this.peerUrl}/internal/events`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-internal-token': this.token ?? '' },
          body: JSON.stringify(event),
        });
        if (res.ok) { this.stats.sent += 1; return; }
        if (res.status >= 400 && res.status < 500 && !TRANSIENT_STATUS.has(res.status)) {
          lastError = new Error(`peer rejected the event with HTTP ${res.status}`);
          break; // permanent: retrying will not help
        }
        lastError = new Error(`peer answered HTTP ${res.status}`);
      } catch (err) {
        lastError = err;
      }
      if (attempt < attempts) await this.sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs));
    }

    this.logger.error?.(`RemoteEventBridge: dead-lettered ${event.type} ${event.eventId}: ${lastError?.message}`);
    this.stats.deadLetters.push({ event, error: lastError?.message });
  }

  // Resolves when everything queued so far has been delivered or dead-lettered.
  async idle() {
    while (this.#draining) await this.#draining;
  }

  // Called by the HTTP route (or directly, in tests) with the event the peer sent.
  async receive(event, token = null) {
    if (this.token && token !== this.token) return { status: 'unauthorized' };
    if (!event || typeof event.type !== 'string') throw new Error('RemoteEventBridge: event must have a string "type"');

    if (event.eventId && this.#processed.has(event.eventId)) {
      this.stats.duplicatesIgnored += 1;
      return { status: 'duplicate' };
    }

    await this.localBus.publish({ ...event, __remote: true }); // throws if a handler fails: not marked as processed
    if (event.eventId) {
      this.#processed.add(event.eventId);
      if (this.#processed.size > MAX_REMEMBERED_EVENT_IDS) {
        this.#processed.delete(this.#processed.values().next().value);
      }
    }
    return { status: 'accepted' };
  }

  // Express route for POST /internal/events.
  router() {
    const express = require('express'); // lazy: the bridge itself does not need HTTP to be tested
    const router = express.Router();
    router.post('/events', express.json(), async (req, res, next) => {
      try {
        const result = await this.receive(req.body, req.get('x-internal-token'));
        if (result.status === 'unauthorized') return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
        return res.status(202).json({ status: result.status });
      } catch (err) {
        return next(err);
      }
    });
    return router;
  }
}

module.exports = { RemoteEventBridge };
