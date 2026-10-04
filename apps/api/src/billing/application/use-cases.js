'use strict';

// ─────────────────────────────────────────────
//  Billing application layer: use cases
//
//  Each use case: load aggregate -> one domain call -> save -> publish the
//  events the aggregate recorded. Billing never touches credits: it only
//  publishes CreditsPurchased / RefundRequested and the Ledger reacts.
// ─────────────────────────────────────────────

const { PaymentIntent }  = require('../domain/aggregates');
const { GatewayResultVO, PackDefinitionVO } = require('../domain/value-objects');
const { NotFoundError }   = require('../../shared/errors');

class PaymentIntentNotFoundError extends NotFoundError {
  constructor(paymentIntentId) {
    super(`PaymentIntent "${paymentIntentId}" not found`);
    this.name = 'PaymentIntentNotFoundError';
    this.paymentIntentId = paymentIntentId;
  }
}

async function saveAndPublish(intent, repo, eventBus) {
  await repo.save(intent);
  for (const event of intent.pullDomainEvents()) {
    await eventBus.publish(event);
  }
}

// User presses "buy": creates a PENDING PaymentIntent for the chosen pack.
class InitiatePaymentUseCase {
  constructor(paymentIntentRepo, eventBus) {
    this.paymentIntentRepo = paymentIntentRepo;
    this.eventBus          = eventBus;
  }

  async execute({ userId, packId }) {
    const intent = PaymentIntent.initiate({ userId, packId }); // throws on unknown pack
    await saveAndPublish(intent, this.paymentIntentRepo, this.eventBus);

    return {
      paymentIntentId: intent.paymentIntentId,
      packId:          intent.pack.id,
      credits:         intent.pack.credits,
      amount:          intent.amount.amount,
      currency:        intent.amount.currency,
      status:          intent.status,
    };
  }
}

// Called by the gateway webhook controller.
class ConfirmPaymentUseCase {
  constructor(paymentIntentRepo, eventBus) {
    this.paymentIntentRepo = paymentIntentRepo;
    this.eventBus          = eventBus;
  }

  async execute({ paymentIntentId, gatewayTransactionId, gatewayStatus }) {
    const intent = await this.paymentIntentRepo.findById(paymentIntentId);
    if (!intent) throw new PaymentIntentNotFoundError(paymentIntentId);

    const result = new GatewayResultVO({ gatewayTransactionId, status: gatewayStatus });

    // "pending" carries no news (the final result comes in another webhook), and
    // a redelivered webhook must not fail: gateways would keep retrying it.
    // A CONTRADICTORY result (failed after confirmed) is still a ConflictError.
    if (result.isPending() || intent.hasSettledWith(result)) return;

    if (result.isSucceeded()) {
      intent.confirm(result);
    } else {
      intent.fail(result, `Gateway status: ${gatewayStatus}`);
    }

    await saveAndPublish(intent, this.paymentIntentRepo, this.eventBus);
  }
}

// Step 1 of a refund: ask for it. The Ledger decides (enough credits left?)
// and Billing's handlers (application/handlers.js) finish the refund or put the
// payment back to CONFIRMED. With the in-process bus the handlers have already
// run when publish() returns, so the status returned here is the final one;
// with a real queue it would be REFUND_REQUESTED until the answer arrives.
class RefundPaymentUseCase {
  constructor(paymentIntentRepo, eventBus) {
    this.paymentIntentRepo = paymentIntentRepo;
    this.eventBus          = eventBus;
  }

  async execute({ paymentIntentId }) {
    const intent = await this.paymentIntentRepo.findById(paymentIntentId);
    if (!intent) throw new PaymentIntentNotFoundError(paymentIntentId);

    intent.requestRefund();

    await saveAndPublish(intent, this.paymentIntentRepo, this.eventBus);

    const current = await this.paymentIntentRepo.findById(paymentIntentId);
    return { paymentIntentId, status: current.status };
  }
}

// Read side: payment history of one user, newest first (invoice list).
class ListUserPayments {
  constructor(paymentIntentRepo) {
    this.paymentIntentRepo = paymentIntentRepo;
  }

  async execute({ userId }) {
    const intents = await this.paymentIntentRepo.findByUserId(userId);

    return intents
      .map((i) => ({
        paymentIntentId: i.paymentIntentId,
        packId:          i.pack.id,
        credits:         i.pack.credits,
        amount:          i.amount.amount,
        currency:        i.amount.currency,
        status:          i.status,
        createdAt:       i.createdAt,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

// Read side: the credit pack catalogue shown on the purchase screen.
class ListCreditPacks {
  async execute() {
    return Object.values(PackDefinitionVO.PACKS).map((p) => ({
      packId:         p.id,
      credits:        p.credits,
      price:          p.price,
      currency:       p.currency,
      pricePerCredit: p.pricePerCredit(),
    }));
  }
}

module.exports = {
  saveAndPublish,
  InitiatePaymentUseCase,
  ConfirmPaymentUseCase,
  RefundPaymentUseCase,
  ListUserPayments,
  ListCreditPacks,
  PaymentIntentNotFoundError,
};
