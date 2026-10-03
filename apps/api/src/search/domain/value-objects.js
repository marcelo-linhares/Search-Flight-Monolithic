'use strict';

// Search's own value objects (it does not reuse Billing's PaymentAmountVO or
// Watch's RouteVO: every context speaks its own language).

const { ValidationError } = require('../../shared/errors');

class MoneyVO {
  constructor(amount, currency) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError(`MoneyVO: amount must be a finite positive number, got ${amount}`);
    }
    if (typeof currency !== 'string' || currency.length !== 3) {
      throw new ValidationError('MoneyVO: currency must be 3-char ISO code');
    }
    this.amount   = Math.round(amount * 100) / 100;
    this.currency = currency.toUpperCase();
    Object.freeze(this);
  }

  equals(other) {
    return other instanceof MoneyVO && this.amount === other.amount && this.currency === other.currency;
  }

  isLessThan(other) {
    if (this.currency !== other.currency) {
      throw new ValidationError('MoneyVO: cannot compare different currencies');
    }
    return this.amount < other.amount;
  }
}

// What to search, as received in SearchJobTriggered.
class SearchCriteriaVO {
  constructor({ origin, destination, departureDate, returnDate = null }) {
    for (const [name, value] of Object.entries({ origin, destination, departureDate })) {
      if (typeof value !== 'string' || value === '') {
        throw new ValidationError(`SearchCriteriaVO: ${name} is required`);
      }
    }
    this.origin        = origin;
    this.destination   = destination;
    this.departureDate = departureDate;
    this.returnDate    = returnDate ?? null;
    Object.freeze(this);
  }
}

module.exports = { MoneyVO, SearchCriteriaVO };
