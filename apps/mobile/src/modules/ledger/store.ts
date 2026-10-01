import { create } from 'zustand'
import type { LedgerEntryDTO } from '@searchfly/domain-events'
import { api } from '../../shared/api'

export const LOW_CREDITS_THRESHOLD = 5

interface LedgerState {
  /** Source of truth for CreditBalance — never derive this from Billing. */
  creditBalance: number | null
  entries: LedgerEntryDTO[]
  loadBalance: () => Promise<void>
  loadHistory: () => Promise<void>
  setBalance: (n: number) => void
}

export const useLedgerStore = create<LedgerState>((set) => ({
  creditBalance: null,
  entries: [],
  async loadBalance() { set({ creditBalance: await api.ledger.balance() }) },
  async loadHistory() { set({ entries: await api.ledger.history() }) },
  setBalance: (creditBalance) => set({ creditBalance }),
}))
