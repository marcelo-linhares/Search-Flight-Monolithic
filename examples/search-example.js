'use strict';

/**
 * SearchOrchestrator Example
 * Wire everything and run one search
 *
 * Run with:  node examples/search-example.js
 */

const SearchOrchestrator = require('../src/contexts/SearchOrchestrator');
const { InProcessEventBus } = require('../src/shared/infrastructure/eventBus/InProcessEventBus');

const {
  WatchRequest,
} = SearchOrchestrator.aggregates;

const {
  RouteVO,
  SearchPolicy,
  ThresholdVO,
  CabinClassVO,
  MoneyVO,
  ItineraryVO,
} = SearchOrchestrator.valueObjects;

const Events = SearchOrchestrator.events;

const {
  ExecuteSearchUseCase,
  CreateWatchRequestUseCase,
} = SearchOrchestrator.useCases;

const {
  SearchOrchestrator: SearchService,
} = SearchOrchestrator.services;

// ── Stub: FlightPort (Integration context) ───
// In production, this calls Amadeus / Duffel / Kiwi.
const flightPort = {
  async search({ origin, destination, departureDate, cabinClass }) {
    console.log(`  [FlightPort] Searching ${origin}→${destination} on ${departureDate} (${cabinClass})`);
    return {
      price:                { amount: 1240.50, currency: 'BRL' },
      segments:             [{ from: origin, to: destination, duration: 185 }],
      totalDurationMinutes: 185,
      source:               'amadeus-stub',
    };
  },
};

// ── Stub: In-memory repository ────────────────
const store = new Map();
const watchRequestRepo = {
  async findById(id) { return store.get(id) ?? null; },
  async save(wr)     { store.set(wr.watchRequestId, wr); },
};

// ── Stub: In-process event bus ────────────────
const eventBus = new InProcessEventBus();

// ── Compose ───────────────────────────────────
const orchestrator    = new SearchService(flightPort);
const executeSearchUC = new ExecuteSearchUseCase(watchRequestRepo, orchestrator, eventBus);

// ── Run ───────────────────────────────────────
(async () => {
  console.log('\n=== 1. Create WatchRequest ===\n');

  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days

  const watch = WatchRequest.create({
    userId:     'user-42',
    route:      new RouteVO({ origin: 'GRU', destination: 'LIS', departureDate: '2025-09-20' }),
    policy:     new SearchPolicy({ frequencyMinutes: 60, activeWindowStart: '06:00', activeWindowEnd: '23:00', expiresAt }),
    threshold:  new ThresholdVO({ dropPercent: 10 }),
    cabinClass: new CabinClassVO('economy'),
  }, Events);

  // Persist initial state + publish WatchRequestCreated
  await watchRequestRepo.save(watch);
  const creationEvents = watch.pullDomainEvents();
  for (const e of creationEvents) {
    console.log(`  [EventBus] published → ${e.type}`);
    await eventBus.publish(e);
  }

  console.log('\n=== 2. Scheduler fires — execute search ===\n');
  await executeSearchUC.execute({ watchRequestId: watch.watchRequestId });

  console.log('\n=== 3. Pause the watch ===\n');
  const loaded = await watchRequestRepo.findById(watch.watchRequestId);
  loaded.pause(Events);
  await watchRequestRepo.save(loaded);
  for (const e of loaded.pullDomainEvents()) {
    console.log(`  [EventBus] published → ${e.type}`);
    await eventBus.publish(e);
  }

  console.log('\n=== Done ===\n');
})();
