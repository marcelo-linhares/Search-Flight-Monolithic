'use strict';

/**
 * BillingLedger Example
 * Full lifecycle: new user → gift credits → buy pack → search debits → balance exhausted
 *
 * Run with:  node examples/billing-example.js
 */

const BillingLedger = require('../src/contexts/BillingLedger');
const { InProcessEventBus } = require('../src/shared/infrastructure/eventBus/InProcessEventBus');

const {
  CreditLedger,
  PaymentIntent,
} = BillingLedger.aggregates;

const {
  PackDefinitionVO,
  PaymentAmountVO,
  GatewayResultVO,
  EntryTypeVO,
  CreditBalanceVO,
} = BillingLedger.valueObjects;

const Events = BillingLedger.events;

const {
  OnCreditsPurchased,
  OnPriceSnapshotCaptured,
  OnCreditsRefunded,
} = BillingLedger.eventHandlers;

const {
  ConfirmPaymentUseCase,
  InitiatePaymentUseCase,
} = BillingLedger.useCases;

// ── In-memory stores ──────────────────────────
const ledgers  = new Map();
const intents  = new Map();

const ledgerRepo = {
  findByUserId: async (uid)    => ledgers.get(uid) ?? null,
  save:         async (ledger) => ledgers.set(ledger.userId, ledger),
};

const intentRepo = {
  findById: async (id)     => intents.get(id) ?? null,
  save:     async (intent) => intents.set(intent.paymentIntentId, intent),
};

// ── Event bus ─────────────────────────────────
const eventBus = new InProcessEventBus();

// ── Wire up handlers ──────────────────────────
const onCreditsPurchased    = new OnCreditsPurchased(ledgerRepo, eventBus);
const onPriceSnapshot       = new OnPriceSnapshotCaptured(ledgerRepo, eventBus);
const confirmPaymentUseCase = new ConfirmPaymentUseCase(intentRepo, eventBus);

eventBus.subscribe('CreditsPurchased', e => onCreditsPurchased.handle(e));
eventBus.subscribe('PriceSnapshotCaptured', e => onPriceSnapshot.handle(e));
eventBus.subscribe('BalanceExhausted', e => console.log(`  *** Scheduler should now pause all watches for user ${e.userId} ***`));
eventBus.subscribe('BalanceRestored', e => console.log(`  *** Scheduler should now resume watches for user ${e.userId} ***`));

// ── Helper: print balance ─────────────────────
async function printBalance(userId) {
  const ledger  = await ledgerRepo.findByUserId(userId);
  const balance = ledger.computeBalance(CreditBalanceVO);
  console.log(`  Balance: ${balance.available} credits | status: ${ledger.status}`);
}

// ── Run ───────────────────────────────────────
(async () => {
  const userId = 'user-99';

  console.log('\n=== 1. New user — open ledger with 10 gift credits ===\n');
  const ledger = CreditLedger.openForUser(userId, 10, { EntryTypeVO, CreditBalanceVO, Events });
  await ledgerRepo.save(ledger);
  for (const e of ledger.pullDomainEvents()) await eventBus.publish(e);
  await printBalance(userId);

  console.log('\n=== 2. Simulate 11 searches (will exhaust balance) ===\n');
  for (let i = 1; i <= 11; i++) {
    const fakeSnapshotEvent = {
      type:           'PriceSnapshotCaptured',
      userId,
      watchRequestId: 'watch-001',
      snapshotId:     `snap-${i}`,
    };
    await onPriceSnapshot.handle(fakeSnapshotEvent);
  }
  await printBalance(userId);

  console.log('\n=== 3. User buys the EXPLORER pack (200 credits) ===\n');
  const intent = PaymentIntent.initiate({ userId, packId: 'EXPLORER' }, { PackDefinitionVO, PaymentAmountVO, Events });
  await intentRepo.save(intent);
  console.log(`  PaymentIntent created: ${intent.paymentIntentId}`);

  await confirmPaymentUseCase.execute({
    paymentIntentId:    intent.paymentIntentId,
    gatewayTransactionId: 'gw-txn-abc123',
    gatewayStatus:      'succeeded',
  });
  await printBalance(userId);

  console.log('\n=== Done ===\n');
})();
