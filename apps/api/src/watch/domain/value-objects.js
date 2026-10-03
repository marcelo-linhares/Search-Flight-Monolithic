'use strict';

// Watch Management's own value objects. Search and Scheduler redefine what
// they need from the WatchCreated event payload; nothing here is shared.

const { ValidationError } = require('../../shared/errors');

const IATA = /^[A-Za-z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── RouteVO ───────────────────────────────────

class RouteVO {
  constructor(origin, destination) {
    if (typeof origin !== 'string' || !IATA.test(origin)) {
      throw new ValidationError(`RouteVO: origin must be a 3-letter IATA code, got ${origin}`);
    }
    if (typeof destination !== 'string' || !IATA.test(destination)) {
      throw new ValidationError(`RouteVO: destination must be a 3-letter IATA code, got ${destination}`);
    }
    this.origin      = origin.toUpperCase();
    this.destination = destination.toUpperCase();
    if (this.origin === this.destination) {
      throw new ValidationError('RouteVO: origin and destination must differ');
    }
    Object.freeze(this);
  }
}

// ── TravelDatesVO ─────────────────────────────

function isRealDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

class TravelDatesVO {
  // `now` is only used to reject past departures when a NEW watch is created.
  // Pass undefined when restoring a stored watch.
  constructor(departureDate, returnDate = null, now = undefined) {
    if (!isRealDate(departureDate)) {
      throw new ValidationError(`TravelDatesVO: departure date must be a valid YYYY-MM-DD date, got ${departureDate}`);
    }
    if (now !== undefined && departureDate < now.toISOString().slice(0, 10)) {
      throw new ValidationError('TravelDatesVO: departure date cannot be in the past');
    }
    if (returnDate !== null && returnDate !== undefined) {
      if (!isRealDate(returnDate)) {
        throw new ValidationError(`TravelDatesVO: return date must be a valid YYYY-MM-DD date, got ${returnDate}`);
      }
      if (returnDate < departureDate) {
        throw new ValidationError('TravelDatesVO: return date cannot be before departure date');
      }
    }
    this.departureDate = departureDate;
    this.returnDate    = returnDate ?? null;
    Object.freeze(this);
  }
}

// ── SearchPolicyVO ────────────────────────────
// "Search every N hours for the next M days."

class SearchPolicyVO {
  constructor({ intervalHours = 4, durationDays = 30 } = {}) {
    if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168) {
      throw new ValidationError('SearchPolicyVO: intervalHours must be an integer between 1 and 168');
    }
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
      throw new ValidationError('SearchPolicyVO: durationDays must be an integer between 1 and 365');
    }
    this.intervalHours = intervalHours;
    this.durationDays  = durationDays;
    Object.freeze(this);
  }

  expiresAtFrom(instant) {
    return new Date(instant.getTime() + this.durationDays * DAY_MS).toISOString();
  }
}

module.exports = { RouteVO, TravelDatesVO, SearchPolicyVO };
