'use strict';

// Process entry point: `node src/server.js` (or `yarn api:start`).
// Builds the app, serves the REST API and runs the scheduler on a timer.
//
// Environment:
//   PORT              HTTP port (default 5050, the one the Dockerfile exposes)
//   SCHEDULER_TICK_MS how often the scheduler looks for due searches (default 60000; 0 disables)
//   ENABLE_DEV_ROUTES "true" mounts /api/dev/* helpers (never in production)
//   LEDGER_URL        when set, the Ledger runs as a separate service (see src/services/ledger-service.js)
//   INTERNAL_TOKEN    shared secret between the monolith and the Ledger service

const { createApp } = require('./app');
const { createHttpApp } = require('./http/create-http-app');

async function startServer({
  port = Number(process.env.PORT ?? 5050),
  tickMs = Number(process.env.SCHEDULER_TICK_MS ?? 60000),
  enableDevRoutes = process.env.ENABLE_DEV_ROUTES === 'true',
  app = createApp({ ledgerUrl: process.env.LEDGER_URL ?? null, internalToken: process.env.INTERNAL_TOKEN }),
  logger = console,
} = {}) {
  const http = createHttpApp(app, { enableDevRoutes, logger });

  const httpServer = await new Promise((resolve, reject) => {
    const s = http.listen(port, () => resolve(s));
    s.once('error', reject);
  });

  let ticking = false;
  const timer = tickMs > 0
    ? setInterval(async () => {
      if (ticking) return; // never overlap two ticks
      ticking = true;
      try {
        await app.scheduler.runDueSearches.execute();
      } catch (err) {
        logger.error(err);
      } finally {
        ticking = false;
      }
    }, tickMs)
    : null;

  const actualPort = httpServer.address().port;
  logger.log(`SearchFly API listening on port ${actualPort}`);

  return {
    app,
    port: actualPort,
    stop: () => new Promise((resolve) => {
      if (timer) clearInterval(timer);
      httpServer.close(() => resolve());
    }),
  };
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { startServer };
