'use strict';

const express = require('express');

module.exports = {
  // Credit pack catalogue (authenticated).
  packsRouter(app) {
    const router = express.Router();
    router.get('/', async (req, res) => {
      res.json(await app.billing.listCreditPacks.execute());
    });
    return router;
  },

  // Payment gateway webhook. Public on purpose (the gateway is not a user).
  // TODO(Integration): verify the gateway signature before trusting the body.
  webhookRouter(app) {
    const router = express.Router();
    router.post('/', async (req, res) => {
      const { paymentIntentId, gatewayTransactionId, gatewayStatus } = req.body ?? {};
      await app.billing.confirmPayment.execute({ paymentIntentId, gatewayTransactionId, gatewayStatus });
      res.status(204).end();
    });
    return router;
  },

  // Authenticated user payments.
  paymentsRouter(app) {
    const router = express.Router();

    router.post('/', async (req, res) => {
      const checkout = await app.billing.initiatePayment.execute({ userId: req.userId, packId: req.body?.packId });
      res.status(201).json(checkout);
    });

    router.get('/', async (req, res) => {
      res.json(await app.billing.listUserPayments.execute({ userId: req.userId }));
    });

    return router;
  },
};
