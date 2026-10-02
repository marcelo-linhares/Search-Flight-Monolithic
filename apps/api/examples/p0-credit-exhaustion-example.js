'use strict';

/**
 * P0 flow: credit exhaustion and reactivation, across bounded contexts.
 *
 * Real code:  Billing and Ledger (src/billing).
 * Fakes:      Search, Scheduler/Watch Management and Notification are NOT
 *             implemented yet; the small classes below only simulate the events
 *             they would publish and react to, so you can see how contexts
 *             communicate through events and never call each other.
 *
 * Run with:  node examples/p0-credit-exhaustion-example.js   (from apps/api)
 */

const { CreditLedger, PaymentIntent } = require('../src/billing/domain/aggregates');
const {
  OnCreditsPurchased,
  OnPriceSnapshotCaptured,
  ConfirmPaymentUseCase,
} = require('../src/billing/application/handlers');
const { InProcessEventBus } = require('./_event-bus');

// ── Real: Ledger and Billing persistence (in memory) ──
const ledgers = new Map();
const intents = new Map();
const ledgerRepo = {
  findByUserId: async (id) => ledgers.get(id) ?? null,
  save:         async (l)  => { ledgers.set(l.userId, l); },
};
const intentRepo = {
  findById: async (id) => intents.get(id) ?? null,
  save:     async (i)  => { intents.set(i.paymentIntentId, i); },
};

const bus = new InProcessEventBus({ verbose: true });

// ── Fake: Scheduler + Watch Management ────────────────
class FakeScheduler {
  constructor(eventBus) {
    this.bus = eventBus;
    this.watches = new Map(); // watchId -> { userId, status }
  }
  add(watchId, userId) { this.watches.set(watchId, { userId, status: 'active' }); }
  active() { return [...this.watches].filter(([, w]) => w.status === 'active').map(([id, w]) => ({ id, ...w })); }

  async onBalanceExhausted({ userId }) {
    for (const [watchId, w] of this.watches) {
      if (w.userId === userId && w.status === 'active') {
        w.status = 'suspended_credits';
        await this.bus.publish({ type: 'WatchSuspendedDueToCredits', userId, watchId });
      }
    }
  }
  async onBalanceRestored({ userId }) {
    for (const [watchId, w] of this.watches) {
      if (w.userId === userId && w.status === 'suspended_credits') {
        w.status = 'active';
        await this.bus.publish({ type: 'WatchReactivated', userId, watchId });
      }
    }
  }
  print() {
    for (const [id, w] of this.watches) console.log(`  watch ${id}: ${w.status}`);
    console.log('');
  }
}

// ── Fake: Notification ────────────────────────────────
const notify = (event) => console.log(`  [push] ${event.type} -> user ${event.userId}, watch ${event.watchId}`);

// ── Fake: Search (publishes one snapshot per active watch) ──
async function searchTick(scheduler, tick) {
  const watches = scheduler.active();
  console.log(`  tick ${tick}: Search runs for ${watches.length} active watch(es)`);
  for (const w of watches) {
    await bus.publish({
      type: 'PriceSnapshotCaptured',
      userId: w.userId,
      watchRequestId: w.id,
      snapshotId: `snap-${tick}-${w.id}`,
    });
  }
}

// ── Wiring ────────────────────────────────────
const scheduler = new FakeScheduler(bus);
const onSnapshot  = new OnPriceSnapshotCaptured(ledgerRepo, bus);
const onPurchased = new OnCreditsPurchased(ledgerRepo, bus);
const confirmPayment = new ConfirmPaymentUseCase(intentRepo, bus);

bus.subscribe('PriceSnapshotCaptured',      (e) => onSnapshot.handle(e));   // Search  -> Ledger
bus.subscribe('CreditsPurchased',           (e) => onPurchased.handle(e));  // Billing -> Ledger
bus.subscribe('BalanceExhausted',           (e) => scheduler.onBalanceExhausted(e)); // Ledger -> Scheduler
bus.subscribe('BalanceRestored',            (e) => scheduler.onBalanceRestored(e));  // Ledger -> Scheduler
bus.subscribe('WatchSuspendedDueToCredits', notify);                        // Watch -> Notification
bus.subscribe('WatchReactivated',           notify);

// ── Run ───────────────────────────────────────
(async () => {
  const userId = 'user-42';

  console.log('\n=== 1. User has 2 gift credits and two active watches ===\n');
  const ledger = CreditLedger.openForUser(userId, 2);
  await ledgerRepo.save(ledger);
  for (const e of ledger.pullDomainEvents()) await bus.publish(e);
  scheduler.add('watch-GRU-LIS', userId);
  scheduler.add('watch-GRU-MIA', userId);
  scheduler.print();

  console.log('=== 2. Searches consume the credits: balance reaches zero ===\n');
  await searchTick(scheduler, 1);
  scheduler.print();

  console.log('=== 3. Next tick: nothing runs, watches stay suspended ===\n');
  await searchTick(scheduler, 2);
  console.log('');

  console.log('=== 4. User buys the STARTER pack (50 credits) ===\n');
  const intent = PaymentIntent.initiate({ userId, packId: 'STARTER' });
  await intentRepo.save(intent);
  await confirmPayment.execute({
    paymentIntentId: intent.paymentIntentId,
    gatewayTransactionId: 'gw-txn-1',
    gatewayStatus: 'succeeded',
  });
  scheduler.print();

  console.log('=== 5. Searches resume ===\n');
  await searchTick(scheduler, 3);
  console.log(`\n  Balance: ${(await ledgerRepo.findByUserId(userId)).computeBalance().available} credits\n`);
})();
