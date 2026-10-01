import * as Notifications from 'expo-notifications'
import type { PushPayload } from '@searchfly/domain-events'
import { USE_MOCK } from '../api'
import { mockServer } from '../api/mock/server'

/**
 * Push channel abstraction (transport layer in the architecture diagram).
 * Real mode: expo-notifications (APNs / FCM). Mock mode: the in-memory server pushes directly.
 * Consumers (notification/events.ts) only see PushPayload.
 */
export type PushHandler = (payload: PushPayload) => void

export function subscribePush(handler: PushHandler): () => void {
  if (USE_MOCK) return mockServer.onPush(handler)

  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false }),
  })
  const parse = (n: Notifications.Notification) => n.request.content.data as unknown as PushPayload | undefined
  const sub = Notifications.addNotificationReceivedListener((n) => {
    const p = parse(n)
    if (p?.event) handler(p)
  })
  return () => sub.remove()
}

export async function requestPushPermission(): Promise<boolean> {
  if (USE_MOCK) return true
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}
