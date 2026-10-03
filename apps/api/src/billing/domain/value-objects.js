'use strict';

const { ValidationError } = require('../../shared/errors');

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
    if (!pack) throw new ValidationError(`PackDefinitionVO: unknown pack id "${id}"`);
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
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError(`PaymentAmountVO: amount must be a finite positive number, got ${amount}`);
    }
    if (typeof currency !== 'string' || currency.length !== 3) {
      throw new ValidationError('PaymentAmountVO: currency must be 3-char ISO code');
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
    if (!gatewayTransactionId) throw new ValidationError('GatewayResultVO: gatewayTransactionId required');
    this.gatewayTransactionId = gatewayTransactionId;
    this.status               = status;   // 'succeeded' | 'failed' | 'pending'
    this.rawResponse          = rawResponse;
    Object.freeze(this);
  }

  isSucceeded() { return this.status === 'succeeded'; }
  isFailed()    { return this.status === 'failed'; }
  isPending()   { return this.status === 'pending'; }
}

module.exports = {
  PackDefinitionVO,
  PaymentAmountVO,
  GatewayResultVO,
};
