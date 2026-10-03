'use strict';

const { makeEvent } = require('../../shared/domain-event');

// A watch was created. Subscribers: Scheduler (starts scheduling searches).
// Carries everything Scheduler and Search need so they never query Watch Management.
function WatchCreated({ watchRequestId, userId, origin, destination, departureDate, returnDate, intervalHours, expiresAt, status }) {
  return makeEvent('WatchCreated', {
    watchRequestId, userId, origin, destination, departureDate, returnDate, intervalHours, expiresAt, status,
  });
}

// The user ran out of credits. Subscribers: Scheduler (pause), Notification, mobile client.
function WatchSuspendedDueToCredits({ watchRequestId, userId }) {
  return makeEvent('WatchSuspendedDueToCredits', { watchRequestId, userId });
}

// Credits are back. Subscribers: Scheduler (resume), Notification, mobile client.
function WatchReactivated({ watchRequestId, userId }) {
  return makeEvent('WatchReactivated', { watchRequestId, userId });
}

// The user cancelled the watch. Subscribers: Scheduler (stop).
function WatchCancelled({ watchRequestId, userId }) {
  return makeEvent('WatchCancelled', { watchRequestId, userId });
}

// The search window ended. Subscribers: Scheduler (stop), Notification.
function WatchExpired({ watchRequestId, userId }) {
  return makeEvent('WatchExpired', { watchRequestId, userId });
}

module.exports = {
  WatchCreated,
  WatchSuspendedDueToCredits,
  WatchReactivated,
  WatchCancelled,
  WatchExpired,
};
