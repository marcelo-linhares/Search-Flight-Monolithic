'use strict';

// Read side of the Ledger. The Ledger is the ONLY source of the credit balance:
// UIs and other contexts never derive it from Billing data.
// Queries return plain objects (DTOs), never aggregates.

class LedgerNotFoundError extends Error {
  constructor(userId) {
    super(`Ledger for user "${userId}" not found`);
    this.name = 'LedgerNotFoundError';
    this.userId = userId;
  }
}

class GetCreditBalance {
  constructor(ledgerRepo) {
    this.ledgerRepo = ledgerRepo;
  }

  async execute({ userId }) {
    const ledger = await this.ledgerRepo.findByUserId(userId);
    if (!ledger) throw new LedgerNotFoundError(userId);

    return {
      userId,
      available: ledger.computeBalance().available,
      status:    ledger.status,
    };
  }
}

// Entries newest first.
class GetLedgerHistory {
  constructor(ledgerRepo) {
    this.ledgerRepo = ledgerRepo;
  }

  async execute({ userId }) {
    const ledger = await this.ledgerRepo.findByUserId(userId);
    if (!ledger) throw new LedgerNotFoundError(userId);

    return [...ledger.entries]
      .map((e) => ({
        entryId:     e.entryId,
        type:        e.type.value,
        amount:      e.amount,
        referenceId: e.referenceId,
        description: e.description,
        createdAt:   e.createdAt,
      }))
      .reverse();
  }
}

module.exports = { GetCreditBalance, GetLedgerHistory, LedgerNotFoundError };
