import { registerBillingEvents } from './modules/billing/events'
import { registerLedgerEvents } from './modules/ledger/events'
import { registerNotificationEvents } from './modules/notification/events'
import { registerSearchEvents } from './modules/search/events'
import { registerWatchEvents } from './modules/watch/events'

/**
 * Composition root for the client EventBus: the only place that knows every module's events.ts.
 * Listeners register before the push channel so no early event is dropped.
 */
export function registerAllEvents(): () => void {
  const offs = [
    registerWatchEvents(),
    registerLedgerEvents(),
    registerBillingEvents(),
    registerSearchEvents(),
    registerNotificationEvents(), // last: starts the push subscription
  ]
  return () => offs.forEach((off) => off())
}
