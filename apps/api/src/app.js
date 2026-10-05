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
const { RemoteEventBridge } = require('./shared/remote-event-bridge');
const { registerBilling }   = require('./billing');
const { registerLedger }    = require('./ledger');
const { createRemoteLedgerClient } = require('./ledger/client');
const { registerWatch }     = require('./watch');
const { registerScheduler } = require('./scheduler');
const { registerSearch }    = require('./search');
const { FakeFlightProvider } = require('./integration');

// Events the monolith produces for the Ledger when the Ledger runs as its own service.
const EVENTS_FOR_REMOTE_LEDGER = ['UserRegistered', 'CreditsPurchased', 'RefundRequested', 'PriceSnapshotCaptured'];

// `ledgerUrl` null (default): the Ledger runs inside this process.
// `ledgerUrl` set: the Ledger runs as its own service (src/services/ledger-service.js);
// events cross to it through a RemoteEventBridge and balance reads go through the client.
function createApp({
  eventBus = new InProcessEventBus(),
  giftCredits = 10,
  flightProvider = new FakeFlightProvider(),
  clock = () => new Date(),
  ledgerUrl = null,
  internalToken = null,
  fetchImpl = globalThis.fetch,
  bridgeRetry,
  bridgeSleep,
} = {}) {
  const billing   = registerBilling({ eventBus });
  let ledger;
  let bridge = null;
  if (ledgerUrl) {
    bridge = new RemoteEventBridge({
      localBus: eventBus, peerUrl: ledgerUrl, forwardTypes: EVENTS_FOR_REMOTE_LEDGER,
      token: internalToken, fetchImpl, retry: bridgeRetry, sleep: bridgeSleep,
    }).start();
    ledger = createRemoteLedgerClient({ url: ledgerUrl, token: internalToken ?? '', fetchImpl });
  } else {
    ledger = registerLedger({ eventBus, giftCredits });
  }
  const watch     = registerWatch({ eventBus, clock });
  const scheduler = registerScheduler({ eventBus, clock });
  const search    = registerSearch({ eventBus, flightPort: flightProvider, clock });

  return { eventBus, billing, ledger, watch, scheduler, search, flightProvider, bridge };
}

module.exports = { createApp };
