'use strict';

// ─────────────────────────────────────────────
//  Ledger application layer: event handlers
//
//  Thin subscribers wired to the in-process event bus. The Ledger only knows
//  the PAYLOAD of events from other contexts (userId, credits, ...), never
//  their classes. Each handler: load aggregate -> one domain call -> save ->
//  publish the events the aggregate recorded.
// ─────────────────────────────────────────────

const { CreditLedger } = require('../domain/aggregates');

async function saveAndPublish(ledger, ledgerRepo, eventBus) {
  await ledgerRepo.save(ledger);
  for (const event of ledger.pullDomainEvents()) {
    await eventBus.publish(event);
  }
}

// ── OnUserRegistered ──────────────────────────
// Identity emits this → Ledger opens the user's ledger with gift credits.
// Idempotent: a second UserRegistered for the same user changes nothing.

class OnUserRegistered {
  constructor(ledgerRepo, eventBus, { giftCredits = 10 } = {}) {
    this.ledgerRepo  = ledgerRepo;
    this.eventBus    = eventBus;
    this.giftCredits = giftCredits;
  }

  async handle(event) {
    const existing = await this.ledgerRepo.findByUserId(event.userId);
    if (existing) return;

    const ledger = CreditLedger.openForUser(event.userId, this.giftCredits);
    await saveAndPublish(ledger, this.ledgerRepo, this.eventBus);
  }
}

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
      // Normally the ledger exists since registration; create defensively.
      ledger = CreditLedger.openForUser(event.userId, 0);
    }

    ledger.creditFromPurchase({
      credits:         event.credits,
      paymentIntentId: event.paymentIntentId,
      packId:          event.packId,
    });

    await saveAndPublish(ledger, this.ledgerRepo, this.eventBus);
  }
}

// ── OnPriceSnapshotCaptured ───────────────────
// Search emits this → Ledger debits 1 credit.
// If BalanceExhausted is published, Scheduler pauses the user's watches.

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

    await saveAndPublish(ledger, this.ledgerRepo, this.eventBus);
  }
}

// ── OnCreditsRefunded ─────────────────────────
// Billing emits this → Ledger removes the refunded credits.

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

    await saveAndPublish(ledger, this.ledgerRepo, this.eventBus);
  }
}

module.exports = {
  OnUserRegistered,
  OnCreditsPurchased,
  OnPriceSnapshotCaptured,
  OnCreditsRefunded,
};
