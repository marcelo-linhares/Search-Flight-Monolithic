import type { PushPayload } from '@searchfly/domain-events'
import { bus } from '../../shared/bus'
import { subscribePush } from '../../shared/push'
import { useNotificationStore } from './store'

/**
 * ④ push arrives (expo-notifications) → notification/store
 * ⑤ re-published on the Client EventBus so other modules (watch, ledger…) react without importing this store.
 */
export function handlePush({ event, alert }: PushPayload) {
  if (alert) useNotificationStore.getState().receive(alert)

  if (event.type === 'AlertReceived') {
    if (alert) bus.emit({ ...event, alertId: alert.id })
    return
  }
  bus.emit(event)
  if (alert) bus.emit({ type: 'AlertReceived', alertId: alert.id, kind: alert.kind })
}

export function registerNotificationEvents(): () => void {
  return subscribePush(handlePush)
}
