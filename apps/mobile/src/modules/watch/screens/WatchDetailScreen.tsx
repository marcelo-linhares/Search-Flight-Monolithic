import { ReactNode, useEffect } from 'react'
import { View } from 'react-native'
import { Button, Card, Screen, Txt } from '@searchfly/ui'
import { money, shortDate } from '../../../shared/format'
import { PriceDropBadge } from '../../pricing/components/PriceDropBadge'
import { StatusBadge } from '../components/StatusBadge'
import { useWatchStore } from '../store'

/** `chart` slot is filled by the route with the Search BC price history. */
export function WatchDetailScreen({ id, chart, onTopUp }: { id: string; chart?: ReactNode; onTopUp: () => void }) {
  const watch = useWatchStore((s) => s.watches.find((w) => w.id === id))
  const load = useWatchStore((s) => s.load)
  useEffect(() => { if (!watch) void load() }, [watch, load])

  if (!watch) return <Screen><Txt variant="small">Loading…</Txt></Screen>
  const suspended = watch.status === 'suspended_credits'

  return (
    <Screen>
      <Card accent="watch" style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt variant="title">{watch.origin} → {watch.destination}</Txt>
          <StatusBadge status={watch.status} />
        </View>
        <Txt variant="small">{watch.originCity} to {watch.destinationCity}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt variant="title" style={{ fontSize: 30 }}>{money(watch.currentPriceCents)}</Txt>
          {watch.lastDropPct ? <PriceDropBadge pct={watch.lastDropPct} /> : null}
        </View>
        <Txt variant="mono">target {money(watch.targetPriceCents)} · depart {shortDate(watch.departDate)}
          {watch.returnDate ? ` · return ${shortDate(watch.returnDate)}` : ''}</Txt>
        <Txt variant="mono">expires {shortDate(watch.expiresAt)}</Txt>
      </Card>
      {suspended && (
        <Card accent="danger" style={{ gap: 10 }}>
          <Txt variant="small">Your watch is paused — we stopped checking prices because you’re out of credits.</Txt>
          <Button label="Top up credits" accent="ledger" onPress={onTopUp} />
        </Card>
      )}
      {chart}
    </Screen>
  )
}
