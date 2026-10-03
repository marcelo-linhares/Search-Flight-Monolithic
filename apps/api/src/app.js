'use strict';

// Composition root: the only place that knows every bounded context.
// Creates the event bus and wires each context to it. Contexts talk to each
// other exclusively through events published on this bus.

const { InProcessEventBus } = require('./shared/in-process-event-bus');
const { registerBilling }   = require('./billing');
const { registerLedger }    = require('./ledger');

function createApp({ eventBus = new InProcessEventBus(), giftCredits = 10 } = {}) {
  const billing = registerBilling({ eventBus });
  const ledger  = registerLedger({ eventBus, giftCredits });

  return { eventBus, billing, ledger };
}

module.exports = { createApp };
