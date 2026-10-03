'use strict';

const { makeEvent } = require('../../shared/domain-event');

// A price was observed for a watch. Subscribers: Ledger (debits 1 credit),
// Pricing (looks for drops). Carries everything they need.
function PriceSnapshotCaptured({
  userId, watchRequestId, snapshotId, jobId, origin, destination, departureDate, returnDate, price, provider, capturedAt,
}) {
  return makeEvent('PriceSnapshotCaptured', {
    userId, watchRequestId, snapshotId, jobId, origin, destination, departureDate, returnDate, price, provider, capturedAt,
  });
}

// The search could not produce a price. Nobody is charged. Subscribers: logs/metrics.
function SearchJobFailed({ userId, watchRequestId, jobId, reason, failedAt }) {
  return makeEvent('SearchJobFailed', { userId, watchRequestId, jobId, reason, failedAt });
}

module.exports = { PriceSnapshotCaptured, SearchJobFailed };
