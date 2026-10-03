'use strict';

const { makeEvent } = require('../../shared/domain-event');

// Time to search one watch. Subscriber: Search. `jobId` is the idempotency key:
// Search ignores a second SearchJobTriggered with a jobId it has already seen.
function SearchJobTriggered({ jobId, watchRequestId, userId, origin, destination, departureDate, returnDate, triggeredAt }) {
  return makeEvent('SearchJobTriggered', {
    jobId, watchRequestId, userId, origin, destination, departureDate, returnDate, triggeredAt,
  });
}

// The watch's search window is over. Subscriber: Watch Management (expires the watch).
function SearchWindowEnded({ watchRequestId, userId, endedAt }) {
  return makeEvent('SearchWindowEnded', { watchRequestId, userId, endedAt });
}

module.exports = { SearchJobTriggered, SearchWindowEnded };
