'use strict';

// Errors the application understands. The HTTP layer maps them to status codes
// through `httpStatus` and `code`, so domain code never needs to know about HTTP.

class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

class ValidationError extends DomainError {}   // invalid input or broken invariant
class ForbiddenError extends DomainError {}    // authenticated but not allowed
class NotFoundError extends DomainError {}     // aggregate does not exist (or is not visible)
class ConflictError extends DomainError {}     // action not allowed in the current state

Object.assign(ValidationError.prototype, { httpStatus: 400, code: 'VALIDATION_ERROR' });
Object.assign(ForbiddenError.prototype,  { httpStatus: 403, code: 'FORBIDDEN' });
Object.assign(NotFoundError.prototype,   { httpStatus: 404, code: 'NOT_FOUND' });
Object.assign(ConflictError.prototype,   { httpStatus: 409, code: 'CONFLICT' });

module.exports = { DomainError, ValidationError, ForbiddenError, NotFoundError, ConflictError };
