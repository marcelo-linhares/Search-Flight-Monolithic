'use strict';

const { WatchRequest } = require('../domain/aggregates');
const { RouteVO, TravelDatesVO, SearchPolicyVO } = require('../domain/value-objects');

// Stores a snapshot and rebuilds a fresh aggregate on every read, like a real
// database: pending domain events are never persisted.

function rehydrate(row) {
  return new WatchRequest({
    watchRequestId: row.watchRequestId,
    userId:         row.userId,
    route:          new RouteVO(row.origin, row.destination),
    dates:          new TravelDatesVO(row.departureDate, row.returnDate), // no `now`: do not re-check "past"
    policy:         new SearchPolicyVO({ intervalHours: row.intervalHours, durationDays: row.durationDays }),
    status:         row.status,
    createdAt:      row.createdAt,
    expiresAt:      row.expiresAt,
  });
}

class InMemoryWatchRepository {
  #byId = new Map();

  async findById(watchRequestId) {
    const row = this.#byId.get(watchRequestId);
    return row ? rehydrate(row) : null;
  }

  // Newest first.
  async findByUserId(userId) {
    return [...this.#byId.values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(rehydrate);
  }

  async save(watch) {
    this.#byId.set(watch.watchRequestId, {
      watchRequestId: watch.watchRequestId,
      userId:         watch.userId,
      origin:         watch.route.origin,
      destination:    watch.route.destination,
      departureDate:  watch.dates.departureDate,
      returnDate:     watch.dates.returnDate,
      intervalHours:  watch.policy.intervalHours,
      durationDays:   watch.policy.durationDays,
      status:         watch.status,
      createdAt:      watch.createdAt,
      expiresAt:      watch.expiresAt,
    });
  }
}

module.exports = { InMemoryWatchRepository };
