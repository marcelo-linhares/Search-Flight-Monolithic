'use strict';

const { makeEvent } = require('../../shared/domain-event');

// ── Billing events ─────────────────────────────────────────────────────────

// User's payment gateway call succeeded. Subscriber: Ledger (credit balance).
function PaymentConfirmed({ paymentIntentId, userId, packId, credits, amount, currency }) {
  return makeEvent('PaymentConfirmed', { paymentIntentId, userId, packId, credits, amount, currency });
}

// Full credit pack has been added to user's balance. Subscriber: Ledger (append entry).
function CreditsPurchased({ userId, packId, credits, paymentIntentId }) {
  return makeEvent('CreditsPurchased', { userId, packId, credits, paymentIntentId });
}

// Payment gateway reported failure. Subscriber: Notification (tell the user).
function PaymentFailed({ paymentIntentId, userId, reason }) {
  return makeEvent('PaymentFailed', { paymentIntentId, userId, reason });
}

// Refund was issued for a pack. Subscriber: Ledger (debit the returned credits).
function CreditsRefunded({ userId, paymentIntentId, credits, refundedAt }) {
  return makeEvent('CreditsRefunded', { userId, paymentIntentId, credits, refundedAt });
}

module.exports = {
  PaymentConfirmed,
  CreditsPurchased,
  PaymentFailed,
  CreditsRefunded,
};
