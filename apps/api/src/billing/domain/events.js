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

// Step 1 of a refund: Billing asks for it. Subscriber: Ledger (accepts or rejects).
function RefundRequested({ userId, paymentIntentId, credits, requestedAt }) {
  return makeEvent('RefundRequested', { userId, paymentIntentId, credits, requestedAt });
}

// Step 3 (success): the Ledger accepted, so the refund is complete.
// Subscriber: Notification (tell the user).
function CreditsRefunded({ userId, paymentIntentId, credits, refundedAt }) {
  return makeEvent('CreditsRefunded', { userId, paymentIntentId, credits, refundedAt });
}

// Step 3 (failure): the Ledger rejected the refund; the payment is CONFIRMED again.
// Subscriber: Notification / admin (tell who asked, and why).
function RefundFailed({ userId, paymentIntentId, reason }) {
  return makeEvent('RefundFailed', { userId, paymentIntentId, reason });
}

module.exports = {
  RefundRequested,
  RefundFailed,
  PaymentConfirmed,
  CreditsPurchased,
  PaymentFailed,
  CreditsRefunded,
};
