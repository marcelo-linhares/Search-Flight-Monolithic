'use strict';

// ─────────────────────────────────────────────
//  Billing application layer: event handlers
//
//  Step 3 of the two-step refund. The Ledger answers Billing's RefundRequested
//  with RefundAccepted or RefundRejected; Billing finishes the refund or puts
//  the payment back to CONFIRMED. Both are idempotent (events can be redelivered).
// ─────────────────────────────────────────────

const { saveAndPublish, PaymentIntentNotFoundError } = require('./use-cases');

class OnRefundAccepted {
  constructor(paymentIntentRepo, eventBus) {
    this.paymentIntentRepo = paymentIntentRepo;
    this.eventBus          = eventBus;
  }

  async handle(event) {
    const intent = await this.paymentIntentRepo.findById(event.paymentIntentId);
    if (!intent) throw new PaymentIntentNotFoundError(event.paymentIntentId);

    if (!intent.completeRefund()) return; // already refunded: nothing to do

    await saveAndPublish(intent, this.paymentIntentRepo, this.eventBus);
  }
}

class OnRefundRejected {
  constructor(paymentIntentRepo, eventBus) {
    this.paymentIntentRepo = paymentIntentRepo;
    this.eventBus          = eventBus;
  }

  async handle(event) {
    const intent = await this.paymentIntentRepo.findById(event.paymentIntentId);
    if (!intent) throw new PaymentIntentNotFoundError(event.paymentIntentId);

    if (!intent.rejectRefund(event.reason)) return; // already back to CONFIRMED

    await saveAndPublish(intent, this.paymentIntentRepo, this.eventBus);
  }
}

module.exports = { OnRefundAccepted, OnRefundRejected };
