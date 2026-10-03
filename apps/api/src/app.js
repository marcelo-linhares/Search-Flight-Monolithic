'use strict';

// Composition root: the only place that knows every bounded context.
// Creates the event bus and wires each context to it. Contexts talk to each
// other exclusively through events published on this bus.
//
//   Identity (not built)  -- UserRegistered -------------> Ledger
//   Watch Management      -- WatchCreated / ... ---------> Scheduler
//   Scheduler             -- SearchJobTriggered ---------> Search
//   Scheduler             -- SearchWindowEnded ----------> Watch Management
//   Search                -- PriceSnapshotCaptured ------> Ledger
//   Ledger                -- BalanceExhausted / Restored -> Watch Management
//   Billing               -- CreditsPurchased / Refunded -> Ledger

const { InProcessEventBus } = require('./shared/in-process-event-bus');
const { registerBilling }   = require('./billing');
const { registerLedger }    = require('./ledger');
const { registerWatch }     = require('./watch');
const { registerScheduler } = require('./scheduler');
const { registerSearch }    = require('./search');
const { FakeFlightProvider } = require('./integration');

function createApp({
  eventBus = new InProcessEventBus(),
  giftCredits = 10,
  flightProvider = new FakeFlightProvider(),
  clock = () => new Date(),
} = {}) {
  const billing   = registerBilling({ eventBus });
  const ledger    = registerLedger({ eventBus, giftCredits });
  const watch     = registerWatch({ eventBus, clock });
  const scheduler = registerScheduler({ eventBus, clock });
  const search    = registerSearch({ eventBus, flightPort: flightProvider, clock });

  return { eventBus, billing, ledger, watch, scheduler, search, flightProvider };
}

module.exports = { createApp };
