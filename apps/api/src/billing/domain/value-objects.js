'use strict';

// ── PackDefinitionVO ──────────────────────────
// Describes a purchasable credit pack (catalogue entry, not a purchase record).

class PackDefinitionVO {
  static PACKS = Object.freeze({
    STARTER:      new PackDefinitionVO('STARTER',      50,   9.90,  'BRL'),
    EXPLORER:     new PackDefinitionVO('EXPLORER',    200,  29.90,  'BRL'),
    PROFESSIONAL: new PackDefinitionVO('PROFESSIONAL',600,  69.90,  'BRL'),
  });

  constructor(id, credits, price, currency) {
    this.id       = id;
    this.credits  = credits;
    this.price    = price;
    this.currency = currency;
    Object.freeze(this);
  }

  static fromId(id) {
    const pack = PackDefinitionVO.PACKS[id];
    if (!pack) throw new Error(`PackDefinitionVO: unknown pack id "${id}"`);
    return pack;
  }

  pricePerCredit() {
    return +(this.price / this.credits).toFixed(4);
  }

  toString() {
    return `${this.id} (${this.credits} credits @ ${this.currency} ${this.price})`;
  }
}

// ── PaymentAmountVO ───────────────────────────
// Mirrors MoneyVO from Search but lives in Billing's own language.
// Contexts do NOT share value objects — they redefine what they need.

class PaymentAmountVO {
  constructor(amount, currency) {
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error(`PaymentAmountVO: amount must be positive, got ${amount}`);
    }
    if (typeof currency !== 'string' || currency.length !== 3) {
      throw new Error('PaymentAmountVO: currency must be 3-char ISO code');
    }
    this.amount   = Math.round(amount * 100) / 100;
    this.currency = currency.toUpperCase();
    Object.freeze(this);
  }

  equals(other) {
    return other instanceof PaymentAmountVO &&
      this.amount === other.amount &&
      this.currency === other.currency;
  }

  toString() {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }
}

// ── GatewayResultVO ───────────────────────────
// Immutable record of what the payment gateway returned.
// Billing speaks gateway language here — translation happens in the adapter.

class GatewayResultVO {
  constructor({ gatewayTransactionId, status, rawResponse = null }) {
    if (!gatewayTransactionId) throw new Error('GatewayResultVO: gatewayTransactionId required');
    this.gatewayTransactionId = gatewayTransactionId;
    this.status               = status;   // 'succeeded' | 'failed' | 'pending'
    this.rawResponse          = rawResponse;
    Object.freeze(this);
  }

  isSucceeded() { return this.status === 'succeeded'; }
  isFailed()    { return this.status === 'failed'; }
  isPending()   { return this.status === 'pending'; }
}

// ── EntryTypeVO ──────────────────────────────── (Ledger context)
// Describes why a ledger entry exists.

const VALID_ENTRY_TYPES = ['CREDIT_PURCHASE', 'CREDIT_GIFT', 'SEARCH_DEBIT', 'REFUND', 'ADJUSTMENT'];

class EntryTypeVO {
  constructor(value) {
    if (!VALID_ENTRY_TYPES.includes(value)) {
      throw new Error(`EntryTypeVO: invalid type "${value}". Valid: ${VALID_ENTRY_TYPES.join(', ')}`);
    }
    this.value = value;
    Object.freeze(this);
  }

  isDebit()  { return this.value === 'SEARCH_DEBIT'; }
  isCredit() { return ['CREDIT_PURCHASE', 'CREDIT_GIFT', 'REFUND', 'ADJUSTMENT'].includes(this.value); }

  toString() { return this.value; }
}

// ── CreditBalanceVO ───────────────────────────── (Ledger context)
// A computed snapshot of a user's balance — derived, never stored directly.

class CreditBalanceVO {
  constructor(available, reserved = 0) {
    if (available < 0) throw new Error('CreditBalanceVO: available cannot be negative');
    if (reserved  < 0) throw new Error('CreditBalanceVO: reserved cannot be negative');
    this.available = available;
    this.reserved  = reserved;
    Object.freeze(this);
  }

  effective() { return this.available - this.reserved; }
  isExhausted() { return this.effective() <= 0; }

  debit(amount) {
    if (amount > this.available) throw new Error('CreditBalanceVO: insufficient credits');
    return new CreditBalanceVO(this.available - amount, this.reserved);
  }

  credit(amount) {
    return new CreditBalanceVO(this.available + amount, this.reserved);
  }
}

module.exports = {
  PackDefinitionVO,
  PaymentAmountVO,
  GatewayResultVO,
  EntryTypeVO,
  CreditBalanceVO,
};
