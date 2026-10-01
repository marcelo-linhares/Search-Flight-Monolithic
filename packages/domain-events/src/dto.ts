export type WatchStatus = 'active' | 'suspended_credits' | 'expired' | 'cancelled'
export type AlertKind = 'price_drop' | 'watch_suspended' | 'watch_reactivated' | 'balance_restored' | 'watch_created'

export interface UserDTO { id: string; name: string; email: string }

export interface WatchDTO {
  id: string
  origin: string
  destination: string
  originCity: string
  destinationCity: string
  departDate: string // ISO date
  returnDate?: string
  targetPriceCents: number
  currentPriceCents: number
  lastDropPct?: number
  status: WatchStatus
  expiresAt: string
  createdAt: string
}

export interface CreateWatchInput {
  origin: string
  destination: string
  departDate: string
  returnDate?: string
  targetPriceCents: number
}

export interface PricePointDTO { at: string; cents: number }

export interface CreditPackDTO { id: string; name: string; credits: number; priceCents: number; recommended?: boolean }
export interface CheckoutResultDTO { invoiceId: string; packId: string; credits: number; priceCents: number }

export interface LedgerEntryDTO {
  id: string
  kind: 'debit' | 'credit'
  amount: number
  reason: string
  watchId?: string
  createdAt: string
}

export interface AlertDTO {
  id: string
  kind: AlertKind
  title: string
  body: string
  watchId?: string
  createdAt: string
  read: boolean
}
