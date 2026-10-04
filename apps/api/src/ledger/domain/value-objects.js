'use strict';

// Ledger's own value objects. They are NOT shared with Billing: each context
// redefines what it needs in its own language.

// ── EntryTypeVO ────────────────────────────────
// Describes why a ledger entry exists.

const { ValidationError, ConflictError } = require('../../shared/errors');

const VALID_ENTRY_TYPES = ['CREDIT_PURCHASE', 'CREDIT_GIFT', 'SEARCH_DEBIT', 'REFUND', 'ADJUSTMENT'];

class EntryTypeVO {
  constructor(value) {
    if (!VALID_ENTRY_TYPES.includes(value)) {
      throw new Error(`EntryTypeVO: invalid type "${value}". Valid: ${VALID_ENTRY_TYPES.join(', ')}`);
    }
    this.value = value;
    Object.freeze(this);
  }

  // A refund takes back credits the user bought, so it is a debit (the ledger
  // already stores it as a negative entry).
  isDebit()  { return ['SEARCH_DEBIT', 'REFUND'].includes(this.value); }
  isCredit() { return ['CREDIT_PURCHASE', 'CREDIT_GIFT', 'ADJUSTMENT'].includes(this.value); }

  toString() { return this.value; }
}

function assertPositiveInteger(amount) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError('CreditBalanceVO: amount must be a positive integer');
  }
}

// ── CreditBalanceVO ─────────────────────────────
// A computed snapshot of a user's balance — derived, never stored directly.

class CreditBalanceVO {
  constructor(available, reserved = 0) {
    if (available < 0) throw new Error('CreditBalanceVO: available cannot be negative');
    if (reserved  < 0) throw new Error('CreditBalanceVO: reserved cannot be negative');
    this.available = available;
    this.reserved  = reserved;
    Object.freeze(this);
  }

  effective() { return this.available - this.reserved; }
  isExhausted() { return this.effective() <= 0; }

  // Spends only the effective balance: reserved credits cannot be debited.
  debit(amount) {
    assertPositiveInteger(amount);
    if (amount > this.effective()) throw new ConflictError('CreditBalanceVO: insufficient credits');
    return new CreditBalanceVO(this.available - amount, this.reserved);
  }

  credit(amount) {
    assertPositiveInteger(amount);
    return new CreditBalanceVO(this.available + amount, this.reserved);
  }
}

module.exports = {
  EntryTypeVO,
  CreditBalanceVO,
};
