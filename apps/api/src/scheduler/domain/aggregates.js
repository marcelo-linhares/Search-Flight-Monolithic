'use strict';

const { randomUUID } = require('crypto');
const Events = require('./events');
const { ConflictError } = require('../../shared/errors');

const HOUR_MS = 60 * 60 * 1000;

const ScheduleStatus = Object.freeze({
  ACTIVE: 'ACTIVE',  // runs when due
  PAUSED: 'PAUSED',  // watch suspended for lack of credits
  ENDED:  'ENDED',   // cancelled, expired or window over
});

// ── ScheduledSearch ───────────────────────────
// Scheduler's own view of a watch: WHEN to search and WHAT to search.
// It is built from the WatchCreated payload, so Scheduler never queries Watch
// Management, and it knows nothing about credits: it only follows watch events.

class ScheduledSearch {
  #domainEvents = [];

  constructor({
    watchRequestId, userId, origin, destination, departureDate, returnDate,
    intervalHours, expiresAt, nextRunAt, status,
  }) {
    this.watchRequestId = watchRequestId;
    this.userId         = userId;
    this.origin         = origin;
    this.destination    = destination;
    this.departureDate  = departureDate;
    this.returnDate     = returnDate ?? null;
    this.intervalHours  = intervalHours;
    this.expiresAt      = expiresAt;   // ISO instant: end of the search window
    this.nextRunAt      = nextRunAt;   // ISO instant
    this.status         = status;
  }

  // `payload` is the WatchCreated event. The first search runs at the next tick.
  static schedule(payload, now) {
    return new ScheduledSearch({
      watchRequestId: payload.watchRequestId,
      userId:         payload.userId,
      origin:         payload.origin,
      destination:    payload.destination,
      departureDate:  payload.departureDate,
      returnDate:     payload.returnDate,
      intervalHours:  payload.intervalHours,
      expiresAt:      payload.expiresAt,
      nextRunAt:      now.toISOString(),
      status:         payload.status === 'active' ? ScheduleStatus.ACTIVE : ScheduleStatus.PAUSED,
    });
  }

  isDue(now) {
    const iso = now.toISOString();
    return this.status === ScheduleStatus.ACTIVE && this.nextRunAt <= iso && iso < this.expiresAt;
  }

  // The search window is over and nobody has closed the schedule yet.
  hasEnded(now) {
    return this.status !== ScheduleStatus.ENDED && now.toISOString() >= this.expiresAt;
  }

  trigger(now) {
    if (!this.isDue(now)) {
      throw new ConflictError(`ScheduledSearch: cannot trigger watch "${this.watchRequestId}" (status ${this.status}, next run ${this.nextRunAt})`);
    }
    this.#record(Events.SearchJobTriggered({
      jobId:          randomUUID(),
      watchRequestId: this.watchRequestId,
      userId:         this.userId,
      origin:         this.origin,
      destination:    this.destination,
      departureDate:  this.departureDate,
      returnDate:     this.returnDate,
      triggeredAt:    now.toISOString(),
    }));
    // Next round counts from now: a long outage never causes a burst of searches.
    this.nextRunAt = new Date(now.getTime() + this.intervalHours * HOUR_MS).toISOString();
  }

  pause() {
    if (this.status !== ScheduleStatus.ACTIVE) return false;
    this.status = ScheduleStatus.PAUSED;
    return true;
  }

  resume(now) {
    if (this.status !== ScheduleStatus.PAUSED) return false;
    this.status = ScheduleStatus.ACTIVE;
    this.nextRunAt = now.toISOString();
    return true;
  }

  // The window is over: tell Watch Management.
  end(now) {
    if (this.status === ScheduleStatus.ENDED) return false;
    this.status = ScheduleStatus.ENDED;
    this.#record(Events.SearchWindowEnded({
      watchRequestId: this.watchRequestId,
      userId:         this.userId,
      endedAt:        now.toISOString(),
    }));
    return true;
  }

  // The watch itself was cancelled or expired: stop quietly.
  cancel() {
    if (this.status === ScheduleStatus.ENDED) return false;
    this.status = ScheduleStatus.ENDED;
    return true;
  }

  #record(event) { this.#domainEvents.push(event); }

  pullDomainEvents() {
    const events = [...this.#domainEvents];
    this.#domainEvents = [];
    return events;
  }
}

module.exports = { ScheduledSearch, ScheduleStatus };
