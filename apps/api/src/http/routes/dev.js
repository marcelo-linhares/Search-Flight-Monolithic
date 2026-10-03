'use strict';

const express = require('express');

// Development helpers, mounted only when enableDevRoutes is true.
module.exports = function devRouter(app) {
  const router = express.Router();

  // Runs one scheduler tick now (instead of waiting for the timer).
  router.post('/scheduler/tick', async (req, res) => {
    res.json(await app.scheduler.runDueSearches.execute());
  });

  return router;
};
