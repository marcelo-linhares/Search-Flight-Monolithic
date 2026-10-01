import { create } from 'zustand'
import type { DomainEvent, DomainEventType, EventOf } from '@searchfly/domain-events'

/**
 * Client-side EventBus. Mirrors the server-side Node.js EventEmitter (apps/api/src/bus).
 * Cross-module communication goes through here — modules never import each other's stores.
 */
type Handler<T extends DomainEventType> = (event: EventOf<T>) => void

interface BusStore {
  emit: (event: DomainEvent) => void
  on: <T extends DomainEventType>(type: T, handler: Handler<T>) => () => void
}

// Listener registry lives outside Zustand state: subscribing must not trigger React re-renders.
const listeners = new Map<DomainEventType, Set<(event: never) => void>>()

export const useBus = create<BusStore>(() => ({
  emit(event) {
    listeners.get(event.type)?.forEach((h) => (h as (e: DomainEvent) => void)(event))
  },
  on(type, handler) {
    const set = listeners.get(type) ?? new Set()
    set.add(handler as (event: never) => void)
    listeners.set(type, set)
    return () => {
      set.delete(handler as (event: never) => void)
    }
  },
}))

export const bus = {
  emit: (event: DomainEvent) => useBus.getState().emit(event),
  on: <T extends DomainEventType>(type: T, handler: Handler<T>) => useBus.getState().on(type, handler),
}
