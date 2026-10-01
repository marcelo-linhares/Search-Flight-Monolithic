import type { Api } from '../types'
import { mockServer as s } from './server'

export function createMockApi(): Api {
  return {
    auth: { login: (email) => s.login(email) },
    watch: { list: () => s.listWatches(), get: (id) => s.getWatch(id), create: (i) => s.createWatch(i) },
    search: { history: (id) => s.history(id) },
    ledger: { balance: () => s.balance(), history: () => s.ledgerHistory() },
    billing: { packs: () => s.packs(), checkout: (id) => s.checkout(id) },
    notification: { list: () => s.listAlerts(), markRead: (id) => s.markRead(id) },
  }
}
