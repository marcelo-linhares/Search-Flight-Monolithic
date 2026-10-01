import { create } from 'zustand'
import type { CreateWatchInput, WatchDTO, WatchStatus } from '@searchfly/domain-events'
import { api } from '../../shared/api'

interface WatchState {
  watches: WatchDTO[]
  loading: boolean
  error: string | null
  load: () => Promise<void>
  create: (input: CreateWatchInput) => Promise<WatchDTO>
  /** Driven by bus events (WatchSuspendedDueToCredits / WatchReactivated), never by other stores. */
  setWatchStatus: (id: string, status: WatchStatus) => void
  markPriceDrop: (id: string, toCents: number, fromCents: number) => void
}

export const useWatchStore = create<WatchState>((set) => ({
  watches: [],
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null })
    try {
      set({ watches: await api.watch.list(), loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Could not load watches' })
    }
  },
  async create(input) {
    const w = await api.watch.create(input)
    set((s) => ({ watches: [w, ...s.watches] }))
    return w
  },
  setWatchStatus: (id, status) =>
    set((s) => ({ watches: s.watches.map((w) => (w.id === id ? { ...w, status } : w)) })),
  markPriceDrop: (id, toCents, fromCents) =>
    set((s) => ({
      watches: s.watches.map((w) =>
        w.id === id
          ? { ...w, currentPriceCents: toCents, lastDropPct: Math.round((1 - toCents / fromCents) * 100) }
          : w,
      ),
    })),
}))
