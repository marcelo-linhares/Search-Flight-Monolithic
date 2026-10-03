'use strict';

const express = require('express');

// Ledger read side. The balance only ever comes from the Ledger.
module.exports = function creditsRouter(app) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    res.json(await app.ledger.getCreditBalance.execute({ userId: req.userId }));
  });

  router.get('/history', async (req, res) => {
    res.json(await app.ledger.getLedgerHistory.execute({ userId: req.userId }));
  });

  return router;
};
