import { create } from 'zustand'
import type { CheckoutResultDTO, CreditPackDTO } from '@searchfly/domain-events'
import { api } from '../../shared/api'
import { bus } from '../../shared/bus'

export type CheckoutStatus = 'idle' | 'paying' | 'processing' | 'confirmed' | 'error'

interface BillingState {
  packs: CreditPackDTO[]
  selectedPackId: string | null
  status: CheckoutStatus
  result: CheckoutResultDTO | null
  loadPacks: () => Promise<void>
  select: (id: string) => void
  pay: () => Promise<void>
  markConfirmed: () => void
  reset: () => void
}

export const useBillingStore = create<BillingState>((set, get) => ({
  packs: [],
  selectedPackId: null,
  status: 'idle',
  result: null,
  async loadPacks() {
    const packs = await api.billing.packs()
    set((s) => ({ packs, selectedPackId: s.selectedPackId ?? packs.find((p) => p.recommended)?.id ?? packs[0]?.id ?? null }))
  },
  select: (selectedPackId) => set({ selectedPackId }),
  async pay() {
    const { selectedPackId } = get()
    if (!selectedPackId) return
    set({ status: 'paying' })
    try {
      const result = await api.billing.checkout(selectedPackId)
      // Payment accepted; balance arrives later as BalanceRestored (Ledger owns the balance).
      set({ status: 'processing', result })
      bus.emit({ type: 'CreditsPurchased', packId: result.packId, credits: result.credits })
    } catch {
      set({ status: 'error' })
    }
  },
  markConfirmed: () => set((s) => (s.status === 'processing' ? { status: 'confirmed' } : s)),
  reset: () => set({ status: 'idle', result: null }),
}))
