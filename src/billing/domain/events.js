'use strict';

const { randomUUID } = require('crypto');

function makeEvent(type, payload) {
  return Object.freeze({
    eventId:    randomUUID(),
    occurredAt: new Date().toISOString(),
    type,
    ...payload,
  });
}

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

// ── Ledger events ──────────────────────────────────────────────────────────

// One search run consumed a credit. Subscriber: Audit log.
function SearchCreditDebited({ userId, watchRequestId, snapshotId, creditsRemaining }) {
  return makeEvent('SearchCreditDebited', { userId, watchRequestId, snapshotId, creditsRemaining });
}

// Balance dropped to zero or below. Subscriber: Scheduler (pause all watches).
function BalanceExhausted({ userId, exhaustedAt }) {
  return makeEvent('BalanceExhausted', { userId, exhaustedAt });
}

// Balance was topped up after being exhausted. Subscriber: Scheduler (resume watches).
function BalanceRestored({ userId, newBalance, restoredAt }) {
  return makeEvent('BalanceRestored', { userId, newBalance, restoredAt });
}

// Free credits were seeded for a new user. Subscriber: Notification (welcome message).
function GiftCreditsGranted({ userId, credits, reason }) {
  return makeEvent('GiftCreditsGranted', { userId, credits, reason });
}

module.exports = {
  PaymentConfirmed,
  CreditsPurchased,
  PaymentFailed,
  CreditsRefunded,
  SearchCreditDebited,
  BalanceExhausted,
  BalanceRestored,
  GiftCreditsGranted,
};
