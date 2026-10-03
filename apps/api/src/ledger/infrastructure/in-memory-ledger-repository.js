'use strict';

const { CreditLedger } = require('../domain/aggregates');

// In-memory repository. It stores a SNAPSHOT of the aggregate and rebuilds a
// fresh instance on every read, like a real database would. That way tests
// catch code that forgets to call save(), and pending domain events are never
// persisted (they are published by the handler right after save).

class InMemoryLedgerRepository {
  #byUserId = new Map();

  async findByUserId(userId) {
    const row = this.#byUserId.get(userId);
    return row ? new CreditLedger({ ...row, entries: [...row.entries] }) : null;
  }

  async save(ledger) {
    this.#byUserId.set(ledger.userId, {
      ledgerId:  ledger.ledgerId,
      userId:    ledger.userId,
      entries:   [...ledger.entries], // LedgerEntry is frozen: safe to share
      status:    ledger.status,
      createdAt: ledger.createdAt,
    });
  }
}

module.exports = { InMemoryLedgerRepository };
