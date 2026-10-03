'use strict';

// ─────────────────────────────────────────────
//  In-process event bus (MVP)
//
//  Contexts never call each other: they publish events here and subscribe to
//  the events they care about. Handlers run sequentially, in subscription order.
//  If a handler throws, the remaining handlers still run and publish() rejects
//  afterwards with an AggregateError, so one failing subscriber cannot silently
//  starve the others.
//
//  Later: replace with a message queue; publishers and handlers keep the same
//  contract (publish(event) / subscribe(type, handler)).
// ─────────────────────────────────────────────

class InProcessEventBus {
  #handlers = new Map();
  #onPublish;

  // onPublish: optional observer, called for every event (used by examples/logging).
  constructor({ onPublish = null } = {}) {
    this.#onPublish = onPublish;
  }

  // Returns an unsubscribe function.
  subscribe(type, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`InProcessEventBus: handler for "${type}" must be a function`);
    }
    const list = this.#handlers.get(type) ?? [];
    list.push(handler);
    this.#handlers.set(type, list);

    return () => {
      const current = this.#handlers.get(type) ?? [];
      this.#handlers.set(type, current.filter((h) => h !== handler));
    };
  }

  async publish(event) {
    if (!event || typeof event.type !== 'string') {
      throw new Error('InProcessEventBus: event must have a string "type"');
    }
    if (this.#onPublish) this.#onPublish(event);

    const errors = [];
    for (const handler of [...(this.#handlers.get(event.type) ?? [])]) {
      try {
        await handler(event);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `InProcessEventBus: ${errors.length} handler(s) failed for "${event.type}"`);
    }
  }
}

module.exports = { InProcessEventBus };
