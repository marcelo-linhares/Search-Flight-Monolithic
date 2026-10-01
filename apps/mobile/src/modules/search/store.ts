import { create } from 'zustand'
import type { PricePointDTO } from '@searchfly/domain-events'
import { api } from '../../shared/api'

interface SearchState {
  histories: Record<string, PricePointDTO[]>
  load: (watchId: string) => Promise<void>
}

export const useSearchStore = create<SearchState>((set) => ({
  histories: {},
  async load(watchId) {
    const points = await api.search.history(watchId)
    set((s) => ({ histories: { ...s.histories, [watchId]: points } }))
  },
}))
