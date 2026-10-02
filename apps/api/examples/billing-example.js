'use strict';

/**
 * Billing + Ledger example
 * Lifecycle: new user (gift credits) -> buy a pack -> failed payment -> refund.
 * Everything runs in memory; no database and no HTTP server.
 *
 * Run with:  node examples/billing-example.js   (from apps/api)
 */

const { CreditLedger, PaymentIntent } = require('../src/billing/domain/aggregates');
const {
  OnCreditsPurchased,
  OnCreditsRefunded,
  ConfirmPaymentUseCase,
} = require('../src/billing/application/handlers');
const { InProcessEventBus } = require('./_event-bus');

// ── In-memory repositories ────────────────────
const ledgers = new Map();
const intents = new Map();

const ledgerRepo = {
  findByUserId: async (userId) => ledgers.get(userId) ?? null,
  save:         async (ledger) => { ledgers.set(ledger.userId, ledger); },
};

const intentRepo = {
  findById: async (id)     => intents.get(id) ?? null,
  save:     async (intent) => { intents.set(intent.paymentIntentId, intent); },
};

// ── Wiring ────────────────────────────────────
const eventBus = new InProcessEventBus();
const confirmPayment = new ConfirmPaymentUseCase(intentRepo, eventBus);
const onCreditsPurchased = new OnCreditsPurchased(ledgerRepo, eventBus);
const onCreditsRefunded  = new OnCreditsRefunded(ledgerRepo, eventBus);

eventBus.subscribe('CreditsPurchased', (e) => onCreditsPurchased.handle(e));
eventBus.subscribe('CreditsRefunded',  (e) => onCreditsRefunded.handle(e));

async function printBalance(userId) {
  const ledger = await ledgerRepo.findByUserId(userId);
  console.log(`  Balance: ${ledger.computeBalance().available} credits | ledger status: ${ledger.status}\n`);
}

async function buy(userId, packId, gatewayStatus) {
  const intent = PaymentIntent.initiate({ userId, packId });
  await intentRepo.save(intent);
  console.log(`  PaymentIntent ${intent.paymentIntentId.slice(0, 8)}: ${intent.pack.id} (${intent.pack.credits} credits) for ${intent.amount}`);
  await confirmPayment.execute({
    paymentIntentId:      intent.paymentIntentId,
    gatewayTransactionId: `gw-${Date.now()}`,
    gatewayStatus,
  });
  return intent;
}

// ── Run ───────────────────────────────────────
(async () => {
  const userId = 'user-99';

  console.log('\n=== 1. New user: open the ledger with 10 gift credits ===\n');
  const ledger = CreditLedger.openForUser(userId, 10);
  await ledgerRepo.save(ledger);
  for (const e of ledger.pullDomainEvents()) await eventBus.publish(e);
  await printBalance(userId);

  console.log('=== 2. User buys the STARTER pack (payment succeeds) ===\n');
  const starter = await buy(userId, 'STARTER', 'succeeded');
  await printBalance(userId);

  console.log('=== 3. User tries the EXPLORER pack (payment fails) ===\n');
  await buy(userId, 'EXPLORER', 'failed');
  await printBalance(userId);

  console.log('=== 4. The STARTER payment is refunded ===\n');
  starter.refund();
  await intentRepo.save(starter);
  for (const e of starter.pullDomainEvents()) await eventBus.publish(e);
  await printBalance(userId);

  console.log('=== Done ===\n');
})();
