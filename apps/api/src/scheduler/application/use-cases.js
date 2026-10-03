'use strict';

// One "tick" of the scheduler: for every open schedule, either close its
// expired window or trigger a search if it is due. Run it on a timer
// (src/server.js) or call it directly in tests with a fake clock.

class RunDueSearchesUseCase {
  constructor(scheduleRepo, eventBus, { clock = () => new Date() } = {}) {
    this.scheduleRepo = scheduleRepo;
    this.eventBus     = eventBus;
    this.clock        = clock;
  }

  async execute() {
    const now = this.clock();
    let triggered = 0;
    let ended = 0;

    for (const schedule of await this.scheduleRepo.findOpen()) {
      if (schedule.hasEnded(now)) {
        schedule.end(now);
        ended += 1;
      } else if (schedule.isDue(now)) {
        schedule.trigger(now);
        triggered += 1;
      } else {
        continue;
      }

      await this.scheduleRepo.save(schedule);
      for (const event of schedule.pullDomainEvents()) {
        await this.eventBus.publish(event);
      }
    }

    return { triggered, ended };
  }
}

module.exports = { RunDueSearchesUseCase };
