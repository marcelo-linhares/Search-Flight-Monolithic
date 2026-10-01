import type { AlertDTO } from './dto'

export type DomainEvent =
  | { type: 'WatchSuspendedDueToCredits'; watchId: string }
  | { type: 'WatchReactivated'; watchId: string }
  | { type: 'BalanceRestored'; newBalance: number }
  | { type: 'CreditsPurchased'; packId: string; credits: number }
  | { type: 'PriceDropDetected'; watchId: string; fromCents: number; toCents: number }
  | { type: 'AlertReceived'; alertId: string; kind: AlertDTO['kind'] }

export type DomainEventType = DomainEvent['type']
export type EventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>

/** Payload delivered over the push channel (APNs/FCM via expo-notifications). */
export interface PushPayload {
  event: DomainEvent
  alert?: Omit<AlertDTO, 'read'>
}
