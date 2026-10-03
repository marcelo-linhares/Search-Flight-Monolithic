'use strict';

const { InMemoryScheduleRepository } = require('../../../src/scheduler/infrastructure/in-memory-schedule-repository');

const T0 = new Date('2026-10-10T12:00:00.000Z');
const horas = (n, base = T0) => new Date(base.getTime() + n * 3600 * 1000);

function fakeEventBus() {
  const published = [];
  return {
    published,
    types: () => published.map((e) => e.type),
    async publish(event) { published.push(event); },
  };
}

// Payload de WatchCreated, como o Scheduler o recebe (ele nunca consulta o Watch).
const watchCriado = (over = {}) => ({
  type: 'WatchCreated',
  watchRequestId: 'w-1',
  userId: 'u-1',
  origin: 'GRU',
  destination: 'LIS',
  departureDate: '2026-12-20',
  returnDate: null,
  intervalHours: 4,
  expiresAt: '2026-11-09T12:00:00.000Z',
  status: 'active',
  ...over,
});

const ambiente = (now = T0) => ({
  scheduleRepo: new InMemoryScheduleRepository(),
  bus: fakeEventBus(),
  clock: () => now,
});

module.exports = { T0, horas, fakeEventBus, watchCriado, ambiente };
