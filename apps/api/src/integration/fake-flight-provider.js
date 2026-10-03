'use strict';

// Fake adapter for Search's FlightPort. Deterministic, so demos and tests are
// repeatable: each route has a base price (from a hash of the route) and every
// search drifts it by up to ±15% using a seeded random generator, which gives
// a believable price history. A real adapter (Amadeus, Duffel, ...) would
// translate the provider's data model to the same `{ price, provider }` shape.

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: small seeded PRNG.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class FakeFlightProvider {
  #seed;
  #generators = new Map();
  #noOffers = new Set();
  #failures = 0;
  #failureMessage = 'fake provider failure';

  constructor({ seed = 1, currency = 'BRL' } = {}) {
    this.#seed = seed;
    this.currency = currency;
    this.calls = [];
  }

  // The next `times` searches reject with `message` (simulates provider downtime).
  failNext(times = 1, message = 'fake provider failure') {
    this.#failures = times;
    this.#failureMessage = message;
  }

  // Searches for this route resolve to null (no flights).
  noOffersFor(origin, destination) {
    this.#noOffers.add(`${origin}-${destination}`);
  }

  async findCheapestOffer(criteria) {
    this.calls.push({ ...criteria });

    if (this.#failures > 0) {
      this.#failures -= 1;
      throw new Error(this.#failureMessage);
    }

    const route = `${criteria.origin}-${criteria.destination}`;
    if (this.#noOffers.has(route)) return null;

    if (!this.#generators.has(route)) {
      this.#generators.set(route, prng(this.#seed ^ hash(route)));
    }
    const base = 800 + (hash(route) % 5200);
    const factor = 0.85 + this.#generators.get(route)() * 0.30;

    return {
      price: { amount: Math.round(base * factor * 100) / 100, currency: this.currency },
      provider: 'fake-air',
    };
  }
}

module.exports = { FakeFlightProvider };
