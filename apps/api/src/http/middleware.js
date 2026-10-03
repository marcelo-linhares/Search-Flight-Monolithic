'use strict';

const { DomainError } = require('../shared/errors');

// TEMPORARY authentication: there is no Identity context yet, so the caller
// states who it is with the `x-user-id` header. Replace this middleware with
// real token verification (JWT/session) when Identity exists; routes only
// ever read `req.userId`.
function requireUser(req, res, next) {
  const userId = (req.get('x-user-id') ?? '').trim();
  if (userId === '') {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing x-user-id header' } });
  }
  req.userId = userId;
  return next();
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` } });
}

// Domain errors carry their own HTTP status; anything else is a bug and is
// answered with a generic 500 (details go to the log, never to the client).
function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof DomainError) {
      return res.status(err.httpStatus).json({ error: { code: err.code, message: err.message } });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    }
    logger.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  };
}

module.exports = { requireUser, notFoundHandler, errorHandler };
