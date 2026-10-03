'use strict';

const { WatchRequest } = require('../domain/aggregates');
const { NotFoundError } = require('../../shared/errors');

async function saveAndPublish(watch, repo, eventBus) {
  await repo.save(watch);
  for (const event of watch.pullDomainEvents()) {
    await eventBus.publish(event);
  }
}

// A watch that is missing or belongs to someone else looks the same to the caller.
async function loadOwned(repo, { userId, watchRequestId }) {
  const watch = await repo.findById(watchRequestId);
  if (!watch || !watch.belongsTo(userId)) {
    throw new NotFoundError(`WatchRequest "${watchRequestId}" not found`);
  }
  return watch;
}

class CreateWatchUseCase {
  constructor(watchRepo, creditStatus, eventBus, { clock = () => new Date() } = {}) {
    this.watchRepo    = watchRepo;
    this.creditStatus = creditStatus;
    this.eventBus     = eventBus;
    this.clock        = clock;
  }

  async execute(input) {
    const creditsAvailable = !(await this.creditStatus.isExhausted(input.userId));
    const watch = WatchRequest.create(input, { now: this.clock(), creditsAvailable });

    await saveAndPublish(watch, this.watchRepo, this.eventBus);
    return watch.toDto();
  }
}

class CancelWatchUseCase {
  constructor(watchRepo, eventBus) {
    this.watchRepo = watchRepo;
    this.eventBus  = eventBus;
  }

  async execute({ userId, watchRequestId }) {
    const watch = await loadOwned(this.watchRepo, { userId, watchRequestId });
    watch.cancel();
    await saveAndPublish(watch, this.watchRepo, this.eventBus);
    return watch.toDto();
  }
}

class GetWatchUseCase {
  constructor(watchRepo) {
    this.watchRepo = watchRepo;
  }

  async execute({ userId, watchRequestId }) {
    return (await loadOwned(this.watchRepo, { userId, watchRequestId })).toDto();
  }
}

class ListUserWatchesUseCase {
  constructor(watchRepo) {
    this.watchRepo = watchRepo;
  }

  async execute({ userId }) {
    return (await this.watchRepo.findByUserId(userId)).map((w) => w.toDto());
  }
}

module.exports = { CreateWatchUseCase, CancelWatchUseCase, GetWatchUseCase, ListUserWatchesUseCase };
