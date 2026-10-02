'use strict';

/**
 * Minimal in-process event bus used only by the examples.
 * The real implementation belongs to the infrastructure layer of the monolith
 * (not written yet); handlers only rely on `publish(event)`.
 */
class InProcessEventBus {
  #handlers = new Map();

  constructor({ verbose = true } = {}) {
    this.verbose = verbose;
  }

  subscribe(type, handler) {
    const list = this.#handlers.get(type) ?? [];
    list.push(handler);
    this.#handlers.set(type, list);
  }

  async publish(event) {
    if (this.verbose) console.log(`  [event] ${event.type}`);
    for (const handler of this.#handlers.get(event.type) ?? []) {
      await handler(event);
    }
  }
}

module.exports = { InProcessEventBus };
