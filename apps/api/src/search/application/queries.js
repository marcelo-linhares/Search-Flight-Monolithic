'use strict';

// Price history of one watch, oldest first. Ownership of the watch is checked
// by the caller (the HTTP layer asks Watch Management first); here the query is
// also scoped by userId so a user can never read someone else's prices.

const toDto = (job) => ({
  snapshotId: job.snapshot.snapshotId,
  amount:     job.snapshot.price.amount,
  currency:   job.snapshot.price.currency,
  provider:   job.snapshot.provider,
  capturedAt: job.snapshot.capturedAt,
});

class GetPriceHistory {
  constructor(jobRepo) {
    this.jobRepo = jobRepo;
  }

  async execute({ userId, watchRequestId }) {
    const jobs = await this.jobRepo.findCompletedByWatch({ userId, watchRequestId });
    const snapshots = jobs
      .map(toDto)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

    const lowest = snapshots.reduce((min, s) => (min === null || s.amount < min.amount ? s : min), null);

    return {
      watchRequestId,
      snapshots,
      lowest,
      latest: snapshots.length > 0 ? snapshots[snapshots.length - 1] : null,
    };
  }
}

module.exports = { GetPriceHistory };
