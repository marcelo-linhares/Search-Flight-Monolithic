'use strict';

// ─────────────────────────────────────────────
//  Application-layer event handlers
//
//  These are thin subscribers wired to the in-process
//  event bus. Each listens to one event type and
//  delegates to the appropriate aggregate.
//
//  In MVP: registered with an EventEmitter.
//  Later:  replace with a message queue consumer.
// ─────────────────────────────────────────────

const { CreditLedger, PaymentIntent } = require('../domain/aggregates');
const { GatewayResultVO }             = require('../domain/value-objects');

// ── OnCreditsPurchased ────────────────────────
// Billing emits this → Ledger credits the balance.

class OnCreditsPurchased {
  constructor(ledgerRepo, eventBus) {
    this.ledgerRepo = ledgerRepo;
    this.eventBus   = eventBus;
  }

  async handle(event) {
    let ledger = await this.ledgerRepo.findByUserId(event.userId);

    if (!ledger) {
      // First purchase — ledger was not seeded at registration.
      // Normally it should exist; create defensively.
      ledger = CreditLedger.openForUser(event.userId, 0);
    }

    ledger.creditFromPurchase({
      credits:         event.credits,
      paymentIntentId: event.paymentIntentId,
      packId:          event.packId,
    });

    await this.ledgerRepo.save(ledger);

    for (const e of ledger.pullDomainEvents()) {
      await this.eventBus.publish(e);
    }
  }
}

// ── OnPriceSnapshotCaptured ───────────────────
// Search emits this → Ledger debits 1 credit.

class OnPriceSnapshotCaptured {
  constructor(ledgerRepo, eventBus) {
    this.ledgerRepo = ledgerRepo;
    this.eventBus   = eventBus;
  }

  async handle(event) {
    const ledger = await this.ledgerRepo.findByUserId(event.userId);
    if (!ledger) {
      console.warn(`OnPriceSnapshotCaptured: no ledger for user ${event.userId}`);
      return;
    }

    ledger.debitForSearch({
      watchRequestId: event.watchRequestId,
      snapshotId:     event.snapshotId,
    });

    await this.ledgerRepo.save(ledger);

    for (const e of ledger.pullDomainEvents()) {
      await this.eventBus.publish(e);
      // If BalanceExhausted was published, the Scheduler context listens
      // and will pause all active watches for this user.
    }
  }
}

// ── OnCreditsRefunded ─────────────────────────
// Billing emits this → Ledger debits the returned credits.

class OnCreditsRefunded {
  constructor(ledgerRepo, eventBus) {
    this.ledgerRepo = ledgerRepo;
    this.eventBus   = eventBus;
  }

  async handle(event) {
    const ledger = await this.ledgerRepo.findByUserId(event.userId);
    if (!ledger) return;

    ledger.creditFromRefund({
      credits:         event.credits,
      paymentIntentId: event.paymentIntentId,
    });

    await this.ledgerRepo.save(ledger);

    for (const e of ledger.pullDomainEvents()) {
      await this.eventBus.publish(e);
    }
  }
}

// ── ConfirmPaymentUseCase ─────────────────────
// Called by the gateway webhook controller.

class ConfirmPaymentUseCase {
  constructor(paymentIntentRepo, eventBus) {
    this.paymentIntentRepo = paymentIntentRepo;
    this.eventBus          = eventBus;
  }

  async execute({ paymentIntentId, gatewayTransactionId, gatewayStatus }) {
    const intent = await this.paymentIntentRepo.findById(paymentIntentId);
    if (!intent) throw new Error(`PaymentIntent "${paymentIntentId}" not found`);

    const result = new GatewayResultVO({ gatewayTransactionId, status: gatewayStatus });

    if (result.isSucceeded()) {
      intent.confirm(result);
    } else {
      intent.fail(result, `Gateway status: ${gatewayStatus}`);
    }

    await this.paymentIntentRepo.save(intent);

    for (const e of intent.pullDomainEvents()) {
      await this.eventBus.publish(e);
    }
  }
}

module.exports = {
  OnCreditsPurchased,
  OnPriceSnapshotCaptured,
  OnCreditsRefunded,
  ConfirmPaymentUseCase,
};
