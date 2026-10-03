'use strict';

const { InMemorySearchJobRepository } = require('../../../src/search/infrastructure/in-memory-search-job-repository');

const T0 = new Date('2026-10-10T12:00:00.000Z');

function fakeEventBus() {
  const published = [];
  return {
    published,
    types: () => published.map((e) => e.type),
    async publish(event) { published.push(event); },
  };
}

// Payload de SearchJobTriggered, como a Search o recebe.
const disparo = (over = {}) => ({
  type: 'SearchJobTriggered',
  jobId: 'job-1',
  watchRequestId: 'w-1',
  userId: 'u-1',
  origin: 'GRU',
  destination: 'LIS',
  departureDate: '2026-12-20',
  returnDate: null,
  triggeredAt: T0.toISOString(),
  ...over,
});

// FlightPort falso, controlado pelo teste.
const portaCom = (resultado) => ({
  calls: [],
  async findCheapestOffer(criteria) {
    this.calls.push(criteria);
    if (resultado instanceof Error) throw resultado;
    return typeof resultado === 'function' ? resultado(criteria) : resultado;
  },
});

const oferta = (amount = 3200.5, currency = 'BRL', provider = 'fake-air') => ({ price: { amount, currency }, provider });

const ambiente = () => ({ jobRepo: new InMemorySearchJobRepository(), bus: fakeEventBus(), clock: () => T0 });

module.exports = { T0, fakeEventBus, disparo, portaCom, oferta, ambiente };
