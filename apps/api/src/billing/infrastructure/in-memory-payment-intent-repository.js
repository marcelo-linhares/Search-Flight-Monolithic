'use strict';

const { PaymentIntent } = require('../domain/aggregates');

// In-memory repository. Stores a snapshot and rebuilds a fresh aggregate on
// every read (like a real database), so pending domain events are never persisted.

class InMemoryPaymentIntentRepository {
  #byId = new Map();

  async findById(paymentIntentId) {
    const row = this.#byId.get(paymentIntentId);
    return row ? new PaymentIntent({ ...row }) : null;
  }

  async findByUserId(userId) {
    return [...this.#byId.values()]
      .filter((row) => row.userId === userId)
      .map((row) => new PaymentIntent({ ...row }));
  }

  async save(intent) {
    this.#byId.set(intent.paymentIntentId, {
      paymentIntentId: intent.paymentIntentId,
      userId:          intent.userId,
      pack:            intent.pack,          // frozen VO
      amount:          intent.amount,        // frozen VO
      status:          intent.status,
      gatewayResult:   intent.gatewayResult, // frozen VO or null
      createdAt:       intent.createdAt,
    });
  }
}

module.exports = { InMemoryPaymentIntentRepository };
