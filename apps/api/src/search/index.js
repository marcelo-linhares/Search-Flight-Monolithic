'use strict';

// Public entry point of the Search context.
//   Listens to: SearchJobTriggered (Scheduler)
//   Publishes:  PriceSnapshotCaptured (-> Ledger, Pricing), SearchJobFailed
//   Needs:      a FlightPort (src/integration provides adapters)

const { OnSearchJobTriggered } = require('./application/handlers');
const { GetPriceHistory } = require('./application/queries');
const { InMemorySearchJobRepository } = require('./infrastructure/in-memory-search-job-repository');

function registerSearch({ eventBus, flightPort, clock = () => new Date(), jobRepo = new InMemorySearchJobRepository() }) {
  const onSearchJobTriggered = new OnSearchJobTriggered(jobRepo, flightPort, eventBus, { clock });

  eventBus.subscribe('SearchJobTriggered', (e) => onSearchJobTriggered.handle(e));

  return {
    jobRepo,
    getPriceHistory: new GetPriceHistory(jobRepo),
  };
}

module.exports = { registerSearch };
