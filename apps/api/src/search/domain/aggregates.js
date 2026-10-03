'use strict';

const { randomUUID } = require('crypto');
const { MoneyVO, SearchCriteriaVO } = require('./value-objects');
const Events = require('./events');
const { ConflictError, ValidationError } = require('../../shared/errors');

const SearchJobStatus = Object.freeze({
  PENDING:   'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED:    'FAILED',
});

// ── PriceSnapshot ─────────────────────────────
// The cheapest price seen by one search. Immutable.

class PriceSnapshot {
  constructor({ snapshotId, price, provider = null, capturedAt }) {
    this.snapshotId = snapshotId ?? randomUUID();
    this.price      = price;      // MoneyVO
    this.provider   = provider;
    this.capturedAt = capturedAt; // ISO instant
    Object.freeze(this);
  }
}

// ── SearchJob ─────────────────────────────────
// One execution of a search for a watch. Created from SearchJobTriggered;
// ends COMPLETED (a snapshot exists) or FAILED (nobody is charged).

class SearchJob {
  #domainEvents = [];

  constructor({ jobId, watchRequestId, userId, criteria, status, snapshot = null, failureReason = null, createdAt, finishedAt = null }) {
    this.jobId          = jobId;
    this.watchRequestId = watchRequestId;
    this.userId         = userId;
    this.criteria       = criteria;   // SearchCriteriaVO
    this.status         = status;
    this.snapshot       = snapshot;   // PriceSnapshot | null
    this.failureReason  = failureReason;
    this.createdAt      = createdAt;
    this.finishedAt     = finishedAt;
  }

  static start({ jobId, watchRequestId, userId, criteria }, now) {
    return new SearchJob({
      jobId,
      watchRequestId,
      userId,
      criteria:  new SearchCriteriaVO(criteria),
      status:    SearchJobStatus.PENDING,
      createdAt: now.toISOString(),
    });
  }

  // `offer` is what the FlightPort returned: { price: { amount, currency }, provider }.
  complete(offer, now) {
    this.#assertPending('complete');
    if (!offer || !offer.price) {
      throw new ValidationError('SearchJob: offer with a price is required');
    }
    const price = new MoneyVO(offer.price.amount, offer.price.currency); // throws if invalid

    this.snapshot   = new PriceSnapshot({ price, provider: offer.provider ?? null, capturedAt: now.toISOString() });
    this.status     = SearchJobStatus.COMPLETED;
    this.finishedAt = now.toISOString();

    this.#record(Events.PriceSnapshotCaptured({
      userId:         this.userId,
      watchRequestId: this.watchRequestId,
      snapshotId:     this.snapshot.snapshotId,
      jobId:          this.jobId,
      origin:         this.criteria.origin,
      destination:    this.criteria.destination,
      departureDate:  this.criteria.departureDate,
      returnDate:     this.criteria.returnDate,
      price:          { amount: price.amount, currency: price.currency },
      provider:       this.snapshot.provider,
      capturedAt:     this.snapshot.capturedAt,
    }));
  }

  fail(reason, now) {
    this.#assertPending('fail');
    this.status        = SearchJobStatus.FAILED;
    this.failureReason = reason;
    this.finishedAt    = now.toISOString();

    this.#record(Events.SearchJobFailed({
      userId:         this.userId,
      watchRequestId: this.watchRequestId,
      jobId:          this.jobId,
      reason,
      failedAt:       this.finishedAt,
    }));
  }

  #assertPending(action) {
    if (this.status !== SearchJobStatus.PENDING) {
      throw new ConflictError(`SearchJob: cannot ${action} from status "${this.status}"`);
    }
  }

  #record(event) { this.#domainEvents.push(event); }

  pullDomainEvents() {
    const events = [...this.#domainEvents];
    this.#domainEvents = [];
    return events;
  }
}

module.exports = { SearchJob, SearchJobStatus, PriceSnapshot };
