'use strict';

const { randomUUID } = require('crypto');
const { RouteVO, TravelDatesVO, SearchPolicyVO } = require('./value-objects');
const Events = require('./events');
const { ConflictError, ValidationError } = require('../../shared/errors');

// ── WatchStatus ───────────────────────────────
// Lower-case values are part of the contract with the mobile app.

const WatchStatus = Object.freeze({
  ACTIVE:            'active',
  SUSPENDED_CREDITS: 'suspended_credits',
  EXPIRED:           'expired',
  CANCELLED:         'cancelled',
});

// ── WatchRequest ──────────────────────────────
// A user's order to track the price of one route.
// Lifecycle: active <-> suspended_credits; active|suspended_credits -> expired | cancelled.

class WatchRequest {
  #domainEvents = [];

  constructor({ watchRequestId, userId, route, dates, policy, status, createdAt, expiresAt }) {
    this.watchRequestId = watchRequestId ?? randomUUID();
    this.userId         = userId;
    this.route          = route;    // RouteVO
    this.dates          = dates;    // TravelDatesVO
    this.policy         = policy;   // SearchPolicyVO
    this.status         = status;
    this.createdAt      = createdAt;
    this.expiresAt      = expiresAt;
  }

  // Factory. `creditsAvailable` comes from Watch Management's own projection of
  // Ledger events; a user with no credits starts with a suspended watch.
  static create(
    { userId, origin, destination, departureDate, returnDate = null, intervalHours, durationDays },
    { now, creditsAvailable = true },
  ) {
    if (typeof userId !== 'string' || userId.trim() === '') {
      throw new ValidationError('WatchRequest: userId is required');
    }
    const route  = new RouteVO(origin, destination);
    const dates  = new TravelDatesVO(departureDate, returnDate, now);
    const policy = new SearchPolicyVO({ intervalHours, durationDays });

    const watch = new WatchRequest({
      userId,
      route,
      dates,
      policy,
      status:    creditsAvailable ? WatchStatus.ACTIVE : WatchStatus.SUSPENDED_CREDITS,
      createdAt: now.toISOString(),
      expiresAt: policy.expiresAtFrom(now),
    });

    watch.#record(Events.WatchCreated({
      watchRequestId: watch.watchRequestId,
      userId,
      origin:         route.origin,
      destination:    route.destination,
      departureDate:  dates.departureDate,
      returnDate:     dates.returnDate,
      intervalHours:  policy.intervalHours,
      expiresAt:      watch.expiresAt,
      status:         watch.status,
    }));
    if (!creditsAvailable) {
      watch.#record(Events.WatchSuspendedDueToCredits({ watchRequestId: watch.watchRequestId, userId }));
    }
    return watch;
  }

  // Ledger said BalanceExhausted. Returns false if there was nothing to suspend.
  suspendForCredits() {
    if (this.status !== WatchStatus.ACTIVE) return false;
    this.status = WatchStatus.SUSPENDED_CREDITS;
    this.#record(Events.WatchSuspendedDueToCredits({ watchRequestId: this.watchRequestId, userId: this.userId }));
    return true;
  }

  // Ledger said BalanceRestored. If the search window already ended while the
  // watch was suspended, it expires instead. Returns true only when reactivated.
  reactivate(now) {
    if (this.status !== WatchStatus.SUSPENDED_CREDITS) return false;
    if (now.toISOString() >= this.expiresAt) {
      this.expire();
      return false;
    }
    this.status = WatchStatus.ACTIVE;
    this.#record(Events.WatchReactivated({ watchRequestId: this.watchRequestId, userId: this.userId }));
    return true;
  }

  cancel() {
    if (this.status !== WatchStatus.ACTIVE && this.status !== WatchStatus.SUSPENDED_CREDITS) {
      throw new ConflictError(`WatchRequest: cannot cancel from status "${this.status}"`);
    }
    this.status = WatchStatus.CANCELLED;
    this.#record(Events.WatchCancelled({ watchRequestId: this.watchRequestId, userId: this.userId }));
  }

  // Idempotent: returns false when already expired or cancelled.
  expire() {
    if (this.status !== WatchStatus.ACTIVE && this.status !== WatchStatus.SUSPENDED_CREDITS) return false;
    this.status = WatchStatus.EXPIRED;
    this.#record(Events.WatchExpired({ watchRequestId: this.watchRequestId, userId: this.userId }));
    return true;
  }

  belongsTo(userId) {
    return this.userId === userId;
  }

  // Plain data for the API and for UIs; never expose the aggregate itself.
  toDto() {
    return {
      watchRequestId: this.watchRequestId,
      userId:         this.userId,
      origin:         this.route.origin,
      destination:    this.route.destination,
      departureDate:  this.dates.departureDate,
      returnDate:     this.dates.returnDate,
      intervalHours:  this.policy.intervalHours,
      expiresAt:      this.expiresAt,
      status:         this.status,
      createdAt:      this.createdAt,
    };
  }

  #record(event) { this.#domainEvents.push(event); }

  pullDomainEvents() {
    const events = [...this.#domainEvents];
    this.#domainEvents = [];
    return events;
  }
}

module.exports = { WatchRequest, WatchStatus };
