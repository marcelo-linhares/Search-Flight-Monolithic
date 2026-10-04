'use strict';

const { randomUUID } = require('crypto');
const { PackDefinitionVO, PaymentAmountVO, GatewayResultVO } = require('./value-objects');
const Events = require('./events');
const { ConflictError, ValidationError } = require('../../shared/errors');

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

  constructor({ paymentIntentId, userId, pack, amount, status = PaymentStatus.PENDING, gatewayResult = null, createdAt }) {
    this.paymentIntentId = paymentIntentId ?? randomUUID();
    this.userId          = userId;
    this.pack            = pack;    // PackDefinitionVO
    this.amount          = amount;  // PaymentAmountVO
    this.status          = status;
    this.gatewayResult   = gatewayResult; // GatewayResultVO — set on confirmation/failure
    this.createdAt       = createdAt ?? new Date().toISOString();
  }

  // Factory — called when the user presses "buy".
  static initiate({ userId, packId }) {
    const pack   = PackDefinitionVO.fromId(packId);
    const amount = new PaymentAmountVO(pack.price, pack.currency);
    const intent = new PaymentIntent({ userId, pack, amount });
    return intent; // no event yet — gateway hasn't responded
  }

  // True when this gateway result was already applied (webhooks are redelivered).
  // 'succeeded' stays true after a refund; 'pending' never settles anything.
  hasSettledWith(gatewayResult) {
    if (gatewayResult.isSucceeded()) {
      return [PaymentStatus.CONFIRMED, PaymentStatus.REFUNDED].includes(this.status);
    }
    if (gatewayResult.isFailed()) return this.status === PaymentStatus.FAILED;
    return false;
  }

  // Called by webhook handler when payment gateway confirms success.
  confirm(gatewayResult) {
    if (!(gatewayResult instanceof GatewayResultVO)) {
      throw new ValidationError('PaymentIntent: expected GatewayResultVO');
    }
    if (this.status !== PaymentStatus.PENDING) {
      throw new ConflictError(`PaymentIntent: cannot confirm from status "${this.status}"`);
    }
    if (!gatewayResult.isSucceeded()) {
      throw new ConflictError('PaymentIntent: gateway result is not succeeded');
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
      throw new ConflictError(`PaymentIntent: cannot fail from status "${this.status}"`);
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
      throw new ConflictError(`PaymentIntent: cannot refund from status "${this.status}"`);
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

module.exports = {
  PaymentIntent,
  CreditPack,
  PaymentStatus,
};
