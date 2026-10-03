'use strict';

// Ledger's own value objects. They are NOT shared with Billing: each context
// redefines what it needs in its own language.

// ── EntryTypeVO ────────────────────────────────
// Describes why a ledger entry exists.

const VALID_ENTRY_TYPES = ['CREDIT_PURCHASE', 'CREDIT_GIFT', 'SEARCH_DEBIT', 'REFUND', 'ADJUSTMENT'];

class EntryTypeVO {
  constructor(value) {
    if (!VALID_ENTRY_TYPES.includes(value)) {
      throw new Error(`EntryTypeVO: invalid type "${value}". Valid: ${VALID_ENTRY_TYPES.join(', ')}`);
    }
    this.value = value;
    Object.freeze(this);
  }

  isDebit()  { return this.value === 'SEARCH_DEBIT'; }
  isCredit() { return ['CREDIT_PURCHASE', 'CREDIT_GIFT', 'REFUND', 'ADJUSTMENT'].includes(this.value); }

  toString() { return this.value; }
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

  debit(amount) {
    if (amount > this.available) throw new Error('CreditBalanceVO: insufficient credits');
    return new CreditBalanceVO(this.available - amount, this.reserved);
  }

  credit(amount) {
    return new CreditBalanceVO(this.available + amount, this.reserved);
  }
}

module.exports = {
  EntryTypeVO,
  CreditBalanceVO,
};
