'use strict';

const express = require('express');

module.exports = function watchesRouter(app) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { origin, destination, departureDate, returnDate, intervalHours, durationDays } = req.body ?? {};
    const watch = await app.watch.createWatch.execute({
      userId: req.userId, origin, destination, departureDate, returnDate, intervalHours, durationDays,
    });
    res.status(201).json(watch);
  });

  router.get('/', async (req, res) => {
    res.json(await app.watch.listUserWatches.execute({ userId: req.userId }));
  });

  router.get('/:id', async (req, res) => {
    res.json(await app.watch.getWatch.execute({ userId: req.userId, watchRequestId: req.params.id }));
  });

  router.delete('/:id', async (req, res) => {
    res.json(await app.watch.cancelWatch.execute({ userId: req.userId, watchRequestId: req.params.id }));
  });

  // Presentation layer composes two contexts: Watch Management proves the user
  // owns the watch (404 otherwise), then Search returns the prices.
  router.get('/:id/price-history', async (req, res) => {
    await app.watch.getWatch.execute({ userId: req.userId, watchRequestId: req.params.id });
    res.json(await app.search.getPriceHistory.execute({ userId: req.userId, watchRequestId: req.params.id }));
  });

  return router;
};
