'use strict';

// Watch Management reacts to events from other contexts. It only reads event
// payloads; it never imports Ledger or Scheduler code.

async function saveAndPublish(watch, repo, eventBus) {
  await repo.save(watch);
  for (const event of watch.pullDomainEvents()) {
    await eventBus.publish(event);
  }
}

// Ledger -> suspend every active watch of the user.
class OnBalanceExhausted {
  constructor(watchRepo, creditStatus, eventBus) {
    this.watchRepo    = watchRepo;
    this.creditStatus = creditStatus;
    this.eventBus     = eventBus;
  }

  async handle({ userId }) {
    await this.creditStatus.markExhausted(userId);

    for (const watch of await this.watchRepo.findByUserId(userId)) {
      if (watch.suspendForCredits()) {
        await saveAndPublish(watch, this.watchRepo, this.eventBus);
      }
    }
  }
}

// Ledger -> reactivate the user's suspended watches (or expire the ones whose window ended).
class OnBalanceRestored {
  constructor(watchRepo, creditStatus, eventBus, { clock = () => new Date() } = {}) {
    this.watchRepo    = watchRepo;
    this.creditStatus = creditStatus;
    this.eventBus     = eventBus;
    this.clock        = clock;
  }

  async handle({ userId }) {
    await this.creditStatus.markRestored(userId);

    for (const watch of await this.watchRepo.findByUserId(userId)) {
      if (watch.status !== 'suspended_credits') continue;
      watch.reactivate(this.clock());
      await saveAndPublish(watch, this.watchRepo, this.eventBus);
    }
  }
}

// Scheduler -> the search window ended: expire the watch.
class OnSearchWindowEnded {
  constructor(watchRepo, eventBus) {
    this.watchRepo = watchRepo;
    this.eventBus  = eventBus;
  }

  async handle({ watchRequestId }) {
    const watch = await this.watchRepo.findById(watchRequestId);
    if (!watch) return;
    if (watch.expire()) {
      await saveAndPublish(watch, this.watchRepo, this.eventBus);
    }
  }
}

module.exports = { OnBalanceExhausted, OnBalanceRestored, OnSearchWindowEnded };
