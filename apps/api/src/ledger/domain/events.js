'use strict';

const { makeEvent } = require('../../shared/domain-event');

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

// The Ledger took the refunded credits back. Subscriber: Billing (completes the refund).
function RefundAccepted({ userId, paymentIntentId, credits, creditsRemaining }) {
  return makeEvent('RefundAccepted', { userId, paymentIntentId, credits, creditsRemaining });
}

// The Ledger could not take the credits back (already spent, or no ledger).
// Subscriber: Billing (puts the payment back to CONFIRMED).
function RefundRejected({ userId, paymentIntentId, credits, reason, available }) {
  return makeEvent('RefundRejected', { userId, paymentIntentId, credits, reason, available });
}

module.exports = {
  RefundAccepted,
  RefundRejected,
  SearchCreditDebited,
  BalanceExhausted,
  BalanceRestored,
  GiftCreditsGranted,
};
