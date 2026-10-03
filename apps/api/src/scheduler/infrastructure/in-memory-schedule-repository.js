'use strict';

const { ScheduledSearch, ScheduleStatus } = require('../domain/aggregates');

// Snapshot in, fresh aggregate out (see the other in-memory repositories).

class InMemoryScheduleRepository {
  #byWatchId = new Map();

  async findById(watchRequestId) {
    const row = this.#byWatchId.get(watchRequestId);
    return row ? new ScheduledSearch({ ...row }) : null;
  }

  // Everything that is not ENDED: the tick looks at ACTIVE and PAUSED ones.
  async findOpen() {
    return [...this.#byWatchId.values()]
      .filter((row) => row.status !== ScheduleStatus.ENDED)
      .map((row) => new ScheduledSearch({ ...row }));
  }

  async save(schedule) {
    this.#byWatchId.set(schedule.watchRequestId, {
      watchRequestId: schedule.watchRequestId,
      userId:         schedule.userId,
      origin:         schedule.origin,
      destination:    schedule.destination,
      departureDate:  schedule.departureDate,
      returnDate:     schedule.returnDate,
      intervalHours:  schedule.intervalHours,
      expiresAt:      schedule.expiresAt,
      nextRunAt:      schedule.nextRunAt,
      status:         schedule.status,
    });
  }
}

module.exports = { InMemoryScheduleRepository };
