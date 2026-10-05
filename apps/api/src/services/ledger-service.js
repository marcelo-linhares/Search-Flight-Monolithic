'use strict';

// ─────────────────────────────────────────────
//  Ledger service: the Ledger context running as its own process.
//
//  A second composition root (like src/app.js, but wiring only the Ledger):
//    - its own in-process bus, its own repository
//    - a RemoteEventBridge that receives the events other contexts publish for it
//      (UserRegistered, CreditsPurchased, RefundRequested, PriceSnapshotCaptured)
//      and sends back the ones others react to
//      (BalanceExhausted, BalanceRestored, RefundAccepted, RefundRejected)
//    - an internal read API used by ledger/client.js
//
//  The Ledger context itself (src/ledger) is the SAME code as in the monolith.
//
//  Environment:  LEDGER_PORT (5051)  MONOLITH_URL  INTERNAL_TOKEN  GIFT_CREDITS (10)
// ─────────────────────────────────────────────

const express = require('express');
const { InProcessEventBus } = require('../shared/in-process-event-bus');
const { RemoteEventBridge } = require('../shared/remote-event-bridge');
const { registerLedger } = require('../ledger');
const { notFoundHandler, errorHandler } = require('../http/middleware');

const OUTBOUND_EVENTS = ['BalanceExhausted', 'BalanceRestored', 'RefundAccepted', 'RefundRejected'];

function createLedgerService({
  giftCredits = 10,
  monolithUrl = null,
  token = null,
  fetchImpl = globalThis.fetch,
  retry,
  sleep,
  logger = console,
} = {}) {
  const eventBus = new InProcessEventBus();
  const ledger = registerLedger({ eventBus, giftCredits });
  const bridge = new RemoteEventBridge({
    localBus: eventBus, peerUrl: monolithUrl, forwardTypes: OUTBOUND_EVENTS, token, fetchImpl, retry, sleep, logger,
  }).start();

  const http = express();
  http.disable('x-powered-by');
  http.get('/health', (req, res) => res.json({ status: 'ok', service: 'ledger' }));

  const requireToken = (req, res, next) => {
    if (token && req.get('x-internal-token') !== token) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid internal token' } });
    }
    return next();
  };

  http.use('/internal', requireToken, bridge.router());
  http.get('/internal/ledgers/:userId/balance', requireToken, async (req, res) => {
    res.json(await ledger.getCreditBalance.execute({ userId: req.params.userId }));
  });
  http.get('/internal/ledgers/:userId/history', requireToken, async (req, res) => {
    res.json(await ledger.getLedgerHistory.execute({ userId: req.params.userId }));
  });
  http.use(notFoundHandler);
  http.use(errorHandler(logger));

  return { http, eventBus, ledger, bridge };
}

async function startLedgerService({
  port = Number(process.env.LEDGER_PORT ?? 5051),
  logger = console,
  ...options
} = {}) {
  const service = createLedgerService({
    monolithUrl: process.env.MONOLITH_URL ?? null,
    token: process.env.INTERNAL_TOKEN ?? null,
    giftCredits: Number(process.env.GIFT_CREDITS ?? 10),
    logger,
    ...options,
  });
  const httpServer = await new Promise((resolve, reject) => {
    const s = service.http.listen(port, () => resolve(s));
    s.once('error', reject);
  });
  const actualPort = httpServer.address().port;
  logger.log(`SearchFly Ledger service listening on port ${actualPort}`);

  return {
    ...service,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    stop: () => new Promise((resolve) => httpServer.close(() => resolve())),
  };
}

if (require.main === module) {
  startLedgerService().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { createLedgerService, startLedgerService, OUTBOUND_EVENTS };
