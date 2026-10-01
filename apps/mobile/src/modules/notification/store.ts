import { create } from 'zustand'
import type { AlertDTO } from '@searchfly/domain-events'
import { api } from '../../shared/api'

interface Prefs { push: boolean; email: boolean; priceDrops: boolean }

interface NotificationState {
  alerts: AlertDTO[]
  banner: AlertDTO | null
  prefs: Prefs
  load: () => Promise<void>
  receive: (alert: Omit<AlertDTO, 'read'>) => void
  markRead: (id: string) => void
  dismissBanner: () => void
  setPref: (key: keyof Prefs, value: boolean) => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  alerts: [],
  banner: null,
  prefs: { push: true, email: false, priceDrops: true },
  async load() { set({ alerts: await api.notification.list() }) },
  receive(alert) {
    const full: AlertDTO = { ...alert, read: false }
    set((s) => ({
      alerts: s.alerts.some((a) => a.id === full.id) ? s.alerts : [full, ...s.alerts],
      banner: full,
    }))
  },
  markRead(id) {
    set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)) }))
    void api.notification.markRead(id)
  },
  dismissBanner: () => set({ banner: null }),
  setPref: (key, value) => set({ prefs: { ...get().prefs, [key]: value } }),
}))

export const selectUnread = (s: NotificationState) => s.alerts.filter((a) => !a.read).length
