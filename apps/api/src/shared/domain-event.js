'use strict';

// Shared kernel: only technical plumbing lives here, never domain concepts.
// Each bounded context defines its own events and builds them with makeEvent.

const { randomUUID } = require('crypto');

function makeEvent(type, payload) {
  return Object.freeze({
    eventId:    randomUUID(),
    occurredAt: new Date().toISOString(),
    type,
    ...payload,
  });
}

module.exports = { makeEvent };
