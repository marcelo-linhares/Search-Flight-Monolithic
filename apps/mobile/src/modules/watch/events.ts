import { bus } from '../../shared/bus'
import { useWatchStore } from './store'

/** ⑤ in the P0 flow: Client EventBus → watch/store.ts updates the card. */
export function registerWatchEvents(): () => void {
  const off = [
    bus.on('WatchSuspendedDueToCredits', (e) => useWatchStore.getState().setWatchStatus(e.watchId, 'suspended_credits')),
    bus.on('WatchReactivated', (e) => useWatchStore.getState().setWatchStatus(e.watchId, 'active')),
    bus.on('PriceDropDetected', (e) => useWatchStore.getState().markPriceDrop(e.watchId, e.toCents, e.fromCents)),
  ]
  return () => off.forEach((f) => f())
}
