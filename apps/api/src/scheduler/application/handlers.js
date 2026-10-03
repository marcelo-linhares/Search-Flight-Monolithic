'use strict';

// Scheduler follows the Watch lifecycle through events. It never imports Watch code.

const { ScheduledSearch } = require('../domain/aggregates');

class OnWatchCreated {
  constructor(scheduleRepo, { clock = () => new Date() } = {}) {
    this.scheduleRepo = scheduleRepo;
    this.clock        = clock;
  }

  // Idempotent: a redelivered WatchCreated must not reset an existing schedule.
  async handle(event) {
    if (await this.scheduleRepo.findById(event.watchRequestId)) return;
    await this.scheduleRepo.save(ScheduledSearch.schedule(event, this.clock()));
  }
}

class OnWatchSuspendedDueToCredits {
  constructor(scheduleRepo) {
    this.scheduleRepo = scheduleRepo;
  }

  async handle({ watchRequestId }) {
    const schedule = await this.scheduleRepo.findById(watchRequestId);
    if (!schedule) return;
    if (schedule.pause()) await this.scheduleRepo.save(schedule);
  }
}

class OnWatchReactivated {
  constructor(scheduleRepo, { clock = () => new Date() } = {}) {
    this.scheduleRepo = scheduleRepo;
    this.clock        = clock;
  }

  async handle({ watchRequestId }) {
    const schedule = await this.scheduleRepo.findById(watchRequestId);
    if (!schedule) return;
    if (schedule.resume(this.clock())) await this.scheduleRepo.save(schedule);
  }
}

// WatchCancelled and WatchExpired: stop quietly.
class OnWatchStopped {
  constructor(scheduleRepo) {
    this.scheduleRepo = scheduleRepo;
  }

  async handle({ watchRequestId }) {
    const schedule = await this.scheduleRepo.findById(watchRequestId);
    if (!schedule) return;
    if (schedule.cancel()) await this.scheduleRepo.save(schedule);
  }
}

module.exports = { OnWatchCreated, OnWatchSuspendedDueToCredits, OnWatchReactivated, OnWatchStopped };
