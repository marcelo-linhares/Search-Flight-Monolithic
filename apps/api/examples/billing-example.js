'use strict';

/**
 * Billing + Ledger example
 * Lifecycle: new user (gift credits) -> buy a pack -> failed payment -> refund.
 * Everything runs in memory; no database and no HTTP server.
 * The contexts are wired by the composition root (src/app.js) and only talk
 * to each other through events on the in-process event bus.
 *
 * Run with:  node examples/billing-example.js   (from apps/api)
 */

const { createApp } = require('../src/app');
const { InProcessEventBus } = require('../src/shared/in-process-event-bus');

const app = createApp({
  eventBus: new InProcessEventBus({ onPublish: (e) => console.log(`  [event] ${e.type}`) }),
});

async function printBalance(userId) {
  const { available, status } = await app.ledger.getCreditBalance.execute({ userId });
  console.log(`  Balance: ${available} credits | ledger status: ${status}\n`);
}

async function buy(userId, packId, gatewayStatus) {
  const checkout = await app.billing.initiatePayment.execute({ userId, packId });
  console.log(`  PaymentIntent ${checkout.paymentIntentId.slice(0, 8)}: ${checkout.packId} (${checkout.credits} credits) for ${checkout.currency} ${checkout.amount}`);
  await app.billing.confirmPayment.execute({
    paymentIntentId:      checkout.paymentIntentId,
    gatewayTransactionId: `gw-${Date.now()}`,
    gatewayStatus,
  });
  return checkout.paymentIntentId;
}

(async () => {
  const userId = 'user-99';

  console.log('\n=== 1. New user registers: ledger opens with 10 gift credits ===\n');
  await app.eventBus.publish({ type: 'UserRegistered', userId }); // would come from Identity
  await printBalance(userId);

  console.log('=== 2. User buys the STARTER pack (payment succeeds) ===\n');
  const starterId = await buy(userId, 'STARTER', 'succeeded');
  await printBalance(userId);

  console.log('=== 3. User tries the EXPLORER pack (payment fails) ===\n');
  await buy(userId, 'EXPLORER', 'failed');
  await printBalance(userId);

  console.log('=== 4. The STARTER payment is refunded ===\n');
  await app.billing.refundPayment.execute({ paymentIntentId: starterId });
  await printBalance(userId);

  console.log('=== 5. Histories ===\n');
  console.table(await app.billing.listUserPayments.execute({ userId }), ['packId', 'amount', 'status']);
  console.table(await app.ledger.getLedgerHistory.execute({ userId }), ['type', 'amount', 'description']);
})();
