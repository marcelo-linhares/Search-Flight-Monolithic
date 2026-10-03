'use strict';

// Helpers compartilhados pelos testes do contexto Watch (não é um teste).

const { InMemoryWatchRepository } = require('../../../src/watch/infrastructure/in-memory-watch-repository');
const { InMemoryCreditStatusStore } = require('../../../src/watch/infrastructure/in-memory-credit-status-store');

const AGORA = new Date('2026-10-10T12:00:00.000Z');

function fakeEventBus() {
  const published = [];
  return {
    published,
    types: () => published.map((e) => e.type),
    async publish(event) { published.push(event); },
  };
}

function ambiente(now = AGORA) {
  return {
    watchRepo: new InMemoryWatchRepository(),
    creditStatus: new InMemoryCreditStatusStore(),
    bus: fakeEventBus(),
    clock: () => now,
  };
}

const novoPedido = (over = {}) => ({
  userId: 'u-1', origin: 'GRU', destination: 'LIS', departureDate: '2026-12-20', ...over,
});

module.exports = { AGORA, fakeEventBus, ambiente, novoPedido };
