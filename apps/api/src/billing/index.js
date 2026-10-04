'use strict';

// Public entry point of the Billing context.
// Other code (composition root, controllers) imports ONLY this file.
// Billing publishes PaymentConfirmed, CreditsPurchased, PaymentFailed,
// RefundRequested, CreditsRefunded and RefundFailed. It subscribes to the
// Ledger's answers to a refund request (RefundAccepted / RefundRejected); the
// gateway webhook controller calls confirmPayment directly.

const {
  InitiatePaymentUseCase,
  ConfirmPaymentUseCase,
  RefundPaymentUseCase,
  ListUserPayments,
  ListCreditPacks,
} = require('./application/use-cases');
const { OnRefundAccepted, OnRefundRejected } = require('./application/handlers');
const { InMemoryPaymentIntentRepository } = require('./infrastructure/in-memory-payment-intent-repository');

function registerBilling({ eventBus, paymentIntentRepo = new InMemoryPaymentIntentRepository() }) {
  const onRefundAccepted = new OnRefundAccepted(paymentIntentRepo, eventBus);
  const onRefundRejected = new OnRefundRejected(paymentIntentRepo, eventBus);

  eventBus.subscribe('RefundAccepted', (e) => onRefundAccepted.handle(e));
  eventBus.subscribe('RefundRejected', (e) => onRefundRejected.handle(e));

  return {
    paymentIntentRepo,
    initiatePayment: new InitiatePaymentUseCase(paymentIntentRepo, eventBus),
    confirmPayment:  new ConfirmPaymentUseCase(paymentIntentRepo, eventBus),
    refundPayment:   new RefundPaymentUseCase(paymentIntentRepo, eventBus),
    listUserPayments: new ListUserPayments(paymentIntentRepo),
    listCreditPacks: new ListCreditPacks(),
  };
}

module.exports = { registerBilling };
