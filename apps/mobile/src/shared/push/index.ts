import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { PushPayload } from '@searchfly/domain-events'
import { USE_MOCK } from '../api'
import { mockServer } from '../api/mock/server'

const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type NotificationsModule = typeof import('expo-notifications');
// Lazy: importing expo-notifications inside Expo Go (Android) throws at load time.
const Notifications: NotificationsModule | null = IN_EXPO_GO
  ? null
  : (require('expo-notifications') as NotificationsModule);

/**
 * Push channel abstraction (transport layer in the architecture diagram).
 * Real mode: expo-notifications (APNs / FCM). Mock mode: the in-memory server pushes directly.
 * Consumers (notification/events.ts) only see PushPayload.
 */
export type PushHandler = (payload: PushPayload) => void

export function subscribePush(handler: PushHandler): () => void {
  if (USE_MOCK) return mockServer.onPush(handler)

  Notifications?.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
  })
  const parse = (n: import('expo-notifications').Notification) => n.request.content.data as unknown as PushPayload | undefined
  const sub = Notifications?.addNotificationReceivedListener((n) => {
    const p = parse(n)
    if (p?.event) handler(p)
  })
  return () => sub?.remove()
}

export async function requestPushPermission(): Promise<boolean> {
  if (USE_MOCK) return true
  const permissions = await Notifications?.requestPermissionsAsync()
  return permissions?.status === 'granted'
}
