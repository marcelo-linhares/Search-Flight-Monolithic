import { bus } from '../../shared/bus'
import { useBillingStore } from './store'

export function registerBillingEvents(): () => void {
  // Ledger's BalanceRestored confirms the purchase went through end-to-end.
  return bus.on('BalanceRestored', () => useBillingStore.getState().markConfirmed())
}
