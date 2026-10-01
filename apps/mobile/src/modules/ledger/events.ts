import { bus } from '../../shared/bus'
import { useLedgerStore } from './store'

export function registerLedgerEvents(): () => void {
  const off = [
    // BalanceRestored → balance widget updates
    bus.on('BalanceRestored', (e) => {
      useLedgerStore.getState().setBalance(e.newBalance)
      void useLedgerStore.getState().loadHistory()
    }),
    // A price/alert push implies a search run happened (it debited credits): refresh balance.
    bus.on('PriceDropDetected', () => void useLedgerStore.getState().loadBalance()),
    bus.on('WatchSuspendedDueToCredits', () => void useLedgerStore.getState().loadBalance()),
  ]
  return () => off.forEach((f) => f())
}
