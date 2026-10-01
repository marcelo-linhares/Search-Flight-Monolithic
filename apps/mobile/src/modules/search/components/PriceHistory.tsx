import { useEffect } from 'react'
import { View } from 'react-native'
import { Card, Txt, colors } from '@searchfly/ui'
import { money } from '../../../shared/format'
import { useSearchStore } from '../store'

/** Search BC — price history for a watch (display only). Dependency-free bar chart. */
export function PriceHistory({ watchId }: { watchId: string }) {
  const points = useSearchStore((s) => s.histories[watchId])
  const load = useSearchStore((s) => s.load)
  useEffect(() => { void load(watchId) }, [watchId, load])

  if (!points || points.length === 0) {
    return <Card accent="search"><Txt variant="small">Loading price history…</Txt></Card>
  }
  const cents = points.map((p) => p.cents)
  const min = Math.min(...cents)
  const max = Math.max(...cents)
  const range = Math.max(1, max - min)
  const last = points[points.length - 1]

  return (
    <Card accent="search" style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt variant="tag">PRICE HISTORY · 14 DAYS</Txt>
        <Txt variant="mono" color={colors.search}>{last ? money(last.cents) : ''}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 4 }}>
        {points.map((p, i) => (
          <View
            key={p.at}
            style={{
              flex: 1,
              height: 14 + ((p.cents - min) / range) * 76,
              borderRadius: 3,
              backgroundColor: i === points.length - 1 ? colors.search : colors.search + '55',
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt variant="mono">low {money(min)}</Txt>
        <Txt variant="mono">high {money(max)}</Txt>
      </View>
    </Card>
  )
}
