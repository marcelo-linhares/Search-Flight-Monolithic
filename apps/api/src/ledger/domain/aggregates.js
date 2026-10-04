'use strict';

const { randomUUID } = require('crypto');
const { EntryTypeVO, CreditBalanceVO } = require('./value-objects');
const Events = require('./events');
const { ValidationError, ConflictError } = require('../../shared/errors');

// ═══════════════════════════════════════════════
//  LEDGER CONTEXT
// ═══════════════════════════════════════════════

// ── LedgerEntry ───────────────────────────────
// Child entity of CreditLedger. Append-only — never mutated after creation.

class LedgerEntry {
  constructor({ entryId, type, amount, referenceId, description, createdAt }) {
    this.entryId     = entryId ?? randomUUID();
    this.type        = type instanceof EntryTypeVO ? type : new EntryTypeVO(type);
    this.amount      = amount;       // positive = credits added; negative = credits removed
    this.referenceId = referenceId;  // watchRequestId, paymentIntentId, etc.
    this.description = description;
    this.createdAt   = createdAt ?? new Date().toISOString();
    Object.freeze(this);
  }
}

// ── LedgerStatus enum ─────────────────────────

const LedgerStatus = Object.freeze({
  ACTIVE:    'ACTIVE',
  SUSPENDED: 'SUSPENDED', // balance exhausted
});

// ── CreditLedger ──────────────────────────────
// One per user. The authoritative source of truth for credit balance.
// Listens to Billing events (credit) and Search events (debit).

class CreditLedger {
  #domainEvents = [];

  constructor({ ledgerId, userId, entries = [], status = LedgerStatus.ACTIVE, createdAt }) {
    this.ledgerId  = ledgerId ?? randomUUID();
    this.userId    = userId;
    this.entries   = [...entries];   // LedgerEntry[] — append-only
    this.status    = status;
    this.createdAt = createdAt ?? new Date().toISOString();
  }

  // Factory — called when a new user registers.
  static openForUser(userId, giftCredits = 10) {
    const ledger = new CreditLedger({ userId });

    if (giftCredits > 0) {
      ledger._appendEntry(new LedgerEntry({
        type:        'CREDIT_GIFT',
        amount:      giftCredits,
        referenceId: null,
        description: 'Welcome gift credits',
      }));
      ledger.#record(Events.GiftCreditsGranted({
        userId,
        credits: giftCredits,
        reason:  'new_user_welcome',
      }));
    }

    return ledger;
  }

  // ── Computed balance ─────────────────────────

  computeBalance() {
    const total = this.entries.reduce((sum, e) => sum + e.amount, 0);
    return new CreditBalanceVO(Math.max(0, total));
  }

  // ── Behaviour ────────────────────────────────

  // Called when CreditsPurchased event arrives from Billing.
  // Idempotent: events can be redelivered, and the same payment must never be
  // credited twice. Returns false when this payment was already credited.
  creditFromPurchase({ credits, paymentIntentId, packId }) {
    if (this.hasEntry('CREDIT_PURCHASE', paymentIntentId)) return false;

    this._appendEntry(new LedgerEntry({
      type:        'CREDIT_PURCHASE',
      amount:      credits,
      referenceId: paymentIntentId,
      description: `Purchased pack ${packId}`,
    }));

    const wasExhausted = this.status === LedgerStatus.SUSPENDED;
    this.status = LedgerStatus.ACTIVE;

    if (wasExhausted) {
      this.#record(Events.BalanceRestored({
        userId:      this.userId,
        newBalance:  this.computeBalance().available,
        restoredAt:  new Date().toISOString(),
      }));
    }

    return true;
  }

  // Called when PriceSnapshotCaptured event arrives from Search.
  // Returns false if balance was already zero (caller should not have let the search run).
  // Idempotent per snapshot: a redelivered PriceSnapshotCaptured is not charged
  // twice, while a new snapshot of the same watch is.
  debitForSearch({ watchRequestId, snapshotId, creditsPerSearch = 1 }) {
    if (!snapshotId) throw new ValidationError('CreditLedger: snapshotId required to debit a search');
    if (this.hasEntry('SEARCH_DEBIT', snapshotId)) return false;

    const balance = this.computeBalance();
    if (balance.isExhausted()) {
      return false; // guard — Scheduler should have stopped this
    }

    this._appendEntry(new LedgerEntry({
      type:        'SEARCH_DEBIT',
      amount:      -creditsPerSearch,
      referenceId: snapshotId,
      description: `Search run for watch ${watchRequestId}`,
    }));

    const newBalance = this.computeBalance();

    this.#record(Events.SearchCreditDebited({
      userId:          this.userId,
      watchRequestId,
      snapshotId,
      creditsRemaining: newBalance.available,
    }));

    if (newBalance.isExhausted()) {
      this.status = LedgerStatus.SUSPENDED;
      this.#record(Events.BalanceExhausted({
        userId:      this.userId,
        exhaustedAt: new Date().toISOString(),
      }));
    }

    return true;
  }

  // Called when CreditsRefunded event arrives from Billing.
  // Idempotent like creditFromPurchase: a refund is applied once per payment.
  creditFromRefund({ credits, paymentIntentId }) {
    if (this.hasEntry('REFUND', paymentIntentId)) return false;

    // Credits already spent on searches cannot be taken back.
    if (credits > this.computeBalance().available) {
      throw new ConflictError(
        `CreditLedger: refund of ${credits} credits exceeds the balance of ${this.computeBalance().available}`,
      );
    }

    this._appendEntry(new LedgerEntry({
      type:        'REFUND',
      amount:      -credits,  // refund removes credits that were added
      referenceId: paymentIntentId,
      description: `Refund for payment ${paymentIntentId}`,
    }));

    const newBalance = this.computeBalance();
    if (newBalance.isExhausted() && this.status !== LedgerStatus.SUSPENDED) {
      this.status = LedgerStatus.SUSPENDED;
      this.#record(Events.BalanceExhausted({
        userId:      this.userId,
        exhaustedAt: new Date().toISOString(),
      }));
    }

    return true;
  }

  // True if an entry of this type already references this id (idempotency guard).
  hasEntry(type, referenceId) {
    return this.entries.some((e) => e.type.value === type && e.referenceId === referenceId);
  }

  // ── Internals ─────────────────────────────────

  _appendEntry(entry) {
    this.entries.push(entry);
  }

  #record(event) { this.#domainEvents.push(event); }

  pullDomainEvents() {
    const events = [...this.#domainEvents];
    this.#domainEvents = [];
    return events;
  }
}

module.exports = {
  CreditLedger,
  LedgerEntry,
  LedgerStatus,
};
