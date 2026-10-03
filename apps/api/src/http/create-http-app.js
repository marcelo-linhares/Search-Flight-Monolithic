'use strict';

const express = require('express');
const { requireUser, notFoundHandler, errorHandler } = require('./middleware');
const usersRouter   = require('./routes/users');
const creditsRouter = require('./routes/credits');
const watchesRouter = require('./routes/watches');
const devRouter     = require('./routes/dev');
const { packsRouter, webhookRouter, paymentsRouter } = require('./routes/payments');

// Presentation layer: builds the Express app on top of the composition root
// (`app` from src/app.js). Controllers only translate HTTP <-> use cases;
// all rules live in the contexts.
//
//   Public:        GET /health, POST /api/users (temporary), POST /api/payments/webhook
//   Authenticated: /api/credits, /api/credit-packs, /api/payments, /api/watches
//   Dev only:      POST /api/dev/scheduler/tick (enableDevRoutes)
function createHttpApp(app, { enableDevRoutes = false, logger = console } = {}) {
  const server = express();
  server.disable('x-powered-by');
  server.use(express.json());

  server.get('/health', (req, res) => res.json({ status: 'ok' }));

  server.use('/api/users', usersRouter(app));
  server.use('/api/payments/webhook', webhookRouter(app)); // before the authenticated /api/payments
  if (enableDevRoutes) server.use('/api/dev', devRouter(app));

  server.use('/api/credits',      requireUser, creditsRouter(app));
  server.use('/api/credit-packs', requireUser, packsRouter(app));
  server.use('/api/payments',     requireUser, paymentsRouter(app));
  server.use('/api/watches',      requireUser, watchesRouter(app));

  server.use(notFoundHandler);
  server.use(errorHandler(logger));
  return server;
}

module.exports = { createHttpApp };
