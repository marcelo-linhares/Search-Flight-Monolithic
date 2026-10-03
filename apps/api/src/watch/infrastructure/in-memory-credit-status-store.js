'use strict';

// Watch Management's own read model of "does this user have credits?".
// It is fed ONLY by Ledger events (BalanceExhausted / BalanceRestored), so Watch
// Management never queries the Ledger. Eventually consistent, like any projection.

class InMemoryCreditStatusStore {
  #exhausted = new Set();

  async isExhausted(userId)   { return this.#exhausted.has(userId); }
  async markExhausted(userId) { this.#exhausted.add(userId); }
  async markRestored(userId)  { this.#exhausted.delete(userId); }
}

module.exports = { InMemoryCreditStatusStore };
