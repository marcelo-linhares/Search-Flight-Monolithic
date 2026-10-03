'use strict';

const express = require('express');
const { ValidationError } = require('../../shared/errors');

// Temporary stand-in for the Identity context: registering a user publishes
// UserRegistered, which makes the Ledger open the account with gift credits.
module.exports = function usersRouter(app) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const userId = req.body?.userId;
    if (typeof userId !== 'string' || userId.trim() === '') {
      throw new ValidationError('userId is required');
    }
    await app.eventBus.publish({ type: 'UserRegistered', userId: userId.trim() });
    res.status(201).json({ userId: userId.trim() });
  });

  return router;
};
