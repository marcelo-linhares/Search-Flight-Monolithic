import { useEffect } from 'react'
import { Chip } from '@searchfly/ui'
import { useLedgerStore } from '../store'

export function CreditBalanceChip({ onPress }: { onPress?: () => void }) {
  const balance = useLedgerStore((s) => s.creditBalance)
  const load = useLedgerStore((s) => s.loadBalance)
  useEffect(() => { void load() }, [load])
  return <Chip accent="ledger" label={`${balance ?? '–'} credits`} onPress={onPress} />
}
