'use strict';

// Public entry point of the Watch Management context.
//   Listens to: BalanceExhausted, BalanceRestored (Ledger), SearchWindowEnded (Scheduler)
//   Publishes:  WatchCreated, WatchSuspendedDueToCredits, WatchReactivated, WatchCancelled, WatchExpired

const {
  CreateWatchUseCase,
  CancelWatchUseCase,
  GetWatchUseCase,
  ListUserWatchesUseCase,
} = require('./application/use-cases');
const { OnBalanceExhausted, OnBalanceRestored, OnSearchWindowEnded } = require('./application/handlers');
const { InMemoryWatchRepository } = require('./infrastructure/in-memory-watch-repository');
const { InMemoryCreditStatusStore } = require('./infrastructure/in-memory-credit-status-store');

function registerWatch({
  eventBus,
  clock = () => new Date(),
  watchRepo = new InMemoryWatchRepository(),
  creditStatus = new InMemoryCreditStatusStore(),
}) {
  const onBalanceExhausted = new OnBalanceExhausted(watchRepo, creditStatus, eventBus);
  const onBalanceRestored  = new OnBalanceRestored(watchRepo, creditStatus, eventBus, { clock });
  const onSearchWindowEnded = new OnSearchWindowEnded(watchRepo, eventBus);

  eventBus.subscribe('BalanceExhausted',   (e) => onBalanceExhausted.handle(e));
  eventBus.subscribe('BalanceRestored',    (e) => onBalanceRestored.handle(e));
  eventBus.subscribe('SearchWindowEnded',  (e) => onSearchWindowEnded.handle(e));

  return {
    watchRepo,
    createWatch:     new CreateWatchUseCase(watchRepo, creditStatus, eventBus, { clock }),
    cancelWatch:     new CancelWatchUseCase(watchRepo, eventBus),
    getWatch:        new GetWatchUseCase(watchRepo),
    listUserWatches: new ListUserWatchesUseCase(watchRepo),
  };
}

module.exports = { registerWatch };
