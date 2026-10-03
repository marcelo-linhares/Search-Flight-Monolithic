'use strict';

/**
 * P0 flow: credit exhaustion and reactivation, across bounded contexts.
 *
 * Everything is real code now: Watch Management, Scheduler, Search, Ledger and
 * Billing, wired by src/app.js. Only the flight provider is fake
 * (FakeFlightProvider) and the clock is controlled by this script, so the
 * example jumps through time instead of waiting hours. Notification and Pricing
 * are not built yet; a small subscriber below plays "the push the user would get".
 *
 * Run with:  node examples/p0-credit-exhaustion-example.js   (from apps/api)
 */

const { createApp } = require('../src/app');
const { InProcessEventBus } = require('../src/shared/in-process-event-bus');
const { FakeFlightProvider } = require('../src/integration');

const HOUR = 3600 * 1000;
let now = new Date('2026-10-10T12:00:00.000Z');
const advance = (hours) => { now = new Date(now.getTime() + hours * HOUR); };

const bus = new InProcessEventBus({ onPublish: (e) => console.log(`  [event] ${e.type}`) });
const app = createApp({ eventBus: bus, giftCredits: 2, flightProvider: new FakeFlightProvider({ seed: 42 }), clock: () => now });

// Fake Notification: the push the user would receive.
const notify = (e) => console.log(`  [push] ${e.type} -> user ${e.userId}, watch ${e.watchRequestId}`);
bus.subscribe('WatchSuspendedDueToCredits', notify);
bus.subscribe('WatchReactivated', notify);

async function printWatches(userId) {
  for (const w of await app.watch.listUserWatches.execute({ userId })) {
    console.log(`  watch ${w.origin}-${w.destination}: ${w.status}`);
  }
  const { available, status } = await app.ledger.getCreditBalance.execute({ userId });
  console.log(`  balance: ${available} credits | ledger ${status}\n`);
}

async function tick(label) {
  console.log(`  ${label}`);
  const result = await app.scheduler.runDueSearches.execute();
  console.log(`  tick result: ${JSON.stringify(result)}`);
}

(async () => {
  const userId = 'user-42';
  const trip = { userId, departureDate: '2026-12-20' };

  console.log('\n=== 1. User registers (2 gift credits) and creates two watches ===\n');
  await bus.publish({ type: 'UserRegistered', userId });
  await app.watch.createWatch.execute({ ...trip, origin: 'GRU', destination: 'LIS' });
  await app.watch.createWatch.execute({ ...trip, origin: 'GRU', destination: 'MIA' });
  await printWatches(userId);

  console.log('=== 2. First tick: each watch is searched, each search costs 1 credit ===\n');
  await tick('t = 0h');
  await printWatches(userId);

  console.log('=== 3. Four hours later: nothing runs, the watches are suspended ===\n');
  advance(4);
  await tick('t = +4h');
  console.log('');

  console.log('=== 4. User buys the STARTER pack (50 credits) ===\n');
  const checkout = await app.billing.initiatePayment.execute({ userId, packId: 'STARTER' });
  await app.billing.confirmPayment.execute({
    paymentIntentId: checkout.paymentIntentId, gatewayTransactionId: 'gw-txn-1', gatewayStatus: 'succeeded',
  });
  await printWatches(userId);

  console.log('=== 5. Searches resume at the next tick ===\n');
  await tick('t = +4h (after the purchase)');
  await printWatches(userId);

  console.log('=== 6. Price history of the first watch ===\n');
  const [first] = await app.watch.listUserWatches.execute({ userId });
  const history = await app.search.getPriceHistory.execute({ userId, watchRequestId: first.watchRequestId });
  console.table(history.snapshots, ['capturedAt', 'amount', 'currency']);
})();
