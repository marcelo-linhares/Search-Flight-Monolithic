'use strict';

const { randomUUID } = require('crypto');
const { PackDefinitionVO, PaymentAmountVO, GatewayResultVO, EntryTypeVO, CreditBalanceVO } = require('./value-objects');
const Events = require('./events');

// ═══════════════════════════════════════════════
//  BILLING CONTEXT
// ═══════════════════════════════════════════════

// ── PaymentStatus enum ────────────────────────

const PaymentStatus = Object.freeze({
  PENDING:   'PENDING',
  CONFIRMED: 'CONFIRMED',
  FAILED:    'FAILED',
  REFUNDED:  'REFUNDED',
});

// ── PaymentIntent ─────────────────────────────
// Represents one attempt to purchase a credit pack.
// Created when the user initiates checkout; confirmed or failed
// when the gateway webhook arrives.

class PaymentIntent {
  #domainEvents = [];

  constructor({ paymentIntentId, userId, pack, amount, status = PaymentStatus.PENDING, createdAt }) {
    this.paymentIntentId = paymentIntentId ?? randomUUID();
    this.userId          = userId;
    this.pack            = pack;    // PackDefinitionVO
    this.amount          = amount;  // PaymentAmountVO
    this.status          = status;
    this.gatewayResult   = null;    // GatewayResultVO — set on confirmation
    this.createdAt       = createdAt ?? new Date().toISOString();
  }

  // Factory — called when the user presses "buy".
  static initiate({ userId, packId }) {
    const pack   = PackDefinitionVO.fromId(packId);
    const amount = new PaymentAmountVO(pack.price, pack.currency);
    const intent = new PaymentIntent({ userId, pack, amount });
    return intent; // no event yet — gateway hasn't responded
  }

  // Called by webhook handler when payment gateway confirms success.
  confirm(gatewayResult) {
    if (!(gatewayResult instanceof GatewayResultVO)) {
      throw new Error('PaymentIntent: expected GatewayResultVO');
    }
    if (this.status !== PaymentStatus.PENDING) {
      throw new Error(`PaymentIntent: cannot confirm from status "${this.status}"`);
    }
    if (!gatewayResult.isSucceeded()) {
      throw new Error('PaymentIntent: gateway result is not succeeded');
    }

    this.status        = PaymentStatus.CONFIRMED;
    this.gatewayResult = gatewayResult;

    this.#record(Events.PaymentConfirmed({
      paymentIntentId: this.paymentIntentId,
      userId:          this.userId,
      packId:          this.pack.id,
      credits:         this.pack.credits,
      amount:          this.amount.amount,
      currency:        this.amount.currency,
    }));

    this.#record(Events.CreditsPurchased({
      userId:          this.userId,
      packId:          this.pack.id,
      credits:         this.pack.credits,
      paymentIntentId: this.paymentIntentId,
    }));
  }

  // Called when gateway reports failure.
  fail(gatewayResult, reason) {
    if (this.status !== PaymentStatus.PENDING) {
      throw new Error(`PaymentIntent: cannot fail from status "${this.status}"`);
    }
    this.status        = PaymentStatus.FAILED;
    this.gatewayResult = gatewayResult;

    this.#record(Events.PaymentFailed({
      paymentIntentId: this.paymentIntentId,
      userId:          this.userId,
      reason,
    }));
  }

  // Called when a confirmed payment is refunded.
  refund() {
    if (this.status !== PaymentStatus.CONFIRMED) {
      throw new Error(`PaymentIntent: cannot refund from status "${this.status}"`);
    }
    this.status = PaymentStatus.REFUNDED;
    this.#record(Events.CreditsRefunded({
      userId:          this.userId,
      paymentIntentId: this.paymentIntentId,
      credits:         this.pack.credits,
      refundedAt:      new Date().toISOString(),
    }));
  }

  #record(event) { this.#domainEvents.push(event); }

  pullDomainEvents() {
    const events = [...this.#domainEvents];
    this.#domainEvents = [];
    return events;
  }
}

// ── CreditPack ────────────────────────────────
// A confirmed, named pack owned by a user.
// Created after PaymentIntent is confirmed — it's the receipt.

class CreditPack {
  constructor({ creditPackId, userId, packId, credits, paymentIntentId, grantedAt }) {
    this.creditPackId    = creditPackId ?? randomUUID();
    this.userId          = userId;
    this.packId          = packId;
    this.credits         = credits;
    this.paymentIntentId = paymentIntentId;
    this.grantedAt       = grantedAt ?? new Date().toISOString();
    Object.freeze(this);
  }

  static fromPaymentConfirmed(event) {
    return new CreditPack({
      userId:          event.userId,
      packId:          event.packId,
      credits:         event.credits,
      paymentIntentId: event.paymentIntentId,
    });
  }
}


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
  creditFromPurchase({ credits, paymentIntentId, packId }) {
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
  }

  // Called when PriceSnapshotCaptured event arrives from Search.
  // Returns false if balance was already zero (caller should not have let the search run).
  debitForSearch({ watchRequestId, snapshotId, creditsPerSearch = 1 }) {
    const balance = this.computeBalance();
    if (balance.isExhausted()) {
      return false; // guard — Scheduler should have stopped this
    }

    this._appendEntry(new LedgerEntry({
      type:        'SEARCH_DEBIT',
      amount:      -creditsPerSearch,
      referenceId: watchRequestId,
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
  creditFromRefund({ credits, paymentIntentId }) {
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
  PaymentIntent,
  CreditPack,
  PaymentStatus,
  CreditLedger,
  LedgerEntry,
  LedgerStatus,
};
