'use strict';

const { SearchJob, PriceSnapshot, SearchJobStatus } = require('../domain/aggregates');
const { MoneyVO, SearchCriteriaVO } = require('../domain/value-objects');

function rehydrate(row) {
  return new SearchJob({
    jobId:          row.jobId,
    watchRequestId: row.watchRequestId,
    userId:         row.userId,
    criteria:       new SearchCriteriaVO(row.criteria),
    status:         row.status,
    snapshot:       row.snapshot
      ? new PriceSnapshot({
        snapshotId: row.snapshot.snapshotId,
        price:      new MoneyVO(row.snapshot.amount, row.snapshot.currency),
        provider:   row.snapshot.provider,
        capturedAt: row.snapshot.capturedAt,
      })
      : null,
    failureReason:  row.failureReason,
    createdAt:      row.createdAt,
    finishedAt:     row.finishedAt,
  });
}

// Snapshot in, fresh aggregate out (like a real database).
class InMemorySearchJobRepository {
  #byJobId = new Map();

  async findByJobId(jobId) {
    const row = this.#byJobId.get(jobId);
    return row ? rehydrate(row) : null;
  }

  async findCompletedByWatch({ userId, watchRequestId }) {
    return [...this.#byJobId.values()]
      .filter((r) => r.userId === userId && r.watchRequestId === watchRequestId && r.status === SearchJobStatus.COMPLETED)
      .map(rehydrate);
  }

  async save(job) {
    this.#byJobId.set(job.jobId, {
      jobId:          job.jobId,
      watchRequestId: job.watchRequestId,
      userId:         job.userId,
      criteria:       { ...job.criteria },
      status:         job.status,
      snapshot:       job.snapshot
        ? {
          snapshotId: job.snapshot.snapshotId,
          amount:     job.snapshot.price.amount,
          currency:   job.snapshot.price.currency,
          provider:   job.snapshot.provider,
          capturedAt: job.snapshot.capturedAt,
        }
        : null,
      failureReason:  job.failureReason,
      createdAt:      job.createdAt,
      finishedAt:     job.finishedAt,
    });
  }
}

module.exports = { InMemorySearchJobRepository };
