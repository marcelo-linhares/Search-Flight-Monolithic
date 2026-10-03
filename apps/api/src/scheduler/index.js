'use strict';

// Public entry point of the Scheduler context.
//   Listens to: WatchCreated, WatchSuspendedDueToCredits, WatchReactivated,
//               WatchCancelled, WatchExpired (Watch Management)
//   Publishes:  SearchJobTriggered (-> Search), SearchWindowEnded (-> Watch Management)

const { RunDueSearchesUseCase } = require('./application/use-cases');
const {
  OnWatchCreated,
  OnWatchSuspendedDueToCredits,
  OnWatchReactivated,
  OnWatchStopped,
} = require('./application/handlers');
const { InMemoryScheduleRepository } = require('./infrastructure/in-memory-schedule-repository');

function registerScheduler({ eventBus, clock = () => new Date(), scheduleRepo = new InMemoryScheduleRepository() }) {
  const onCreated    = new OnWatchCreated(scheduleRepo, { clock });
  const onSuspended  = new OnWatchSuspendedDueToCredits(scheduleRepo);
  const onReactivated = new OnWatchReactivated(scheduleRepo, { clock });
  const onStopped    = new OnWatchStopped(scheduleRepo);

  eventBus.subscribe('WatchCreated',               (e) => onCreated.handle(e));
  eventBus.subscribe('WatchSuspendedDueToCredits', (e) => onSuspended.handle(e));
  eventBus.subscribe('WatchReactivated',           (e) => onReactivated.handle(e));
  eventBus.subscribe('WatchCancelled',             (e) => onStopped.handle(e));
  eventBus.subscribe('WatchExpired',               (e) => onStopped.handle(e));

  return {
    scheduleRepo,
    runDueSearches: new RunDueSearchesUseCase(scheduleRepo, eventBus, { clock }),
  };
}

module.exports = { registerScheduler };
