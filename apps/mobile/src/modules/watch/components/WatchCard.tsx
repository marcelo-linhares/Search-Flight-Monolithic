import { Pressable, View } from 'react-native'
import { Button, Card, Txt, colors } from '@searchfly/ui'
import type { WatchDTO } from '@searchfly/domain-events'
import { money, shortDate } from '../../../shared/format'
import { PriceDropBadge } from '../../pricing/components/PriceDropBadge'
import { StatusBadge } from './StatusBadge'

export function WatchCard({
  watch,
  onPress,
  onTopUp,
}: {
  watch: WatchDTO
  onPress: () => void
  onTopUp: () => void
}) {
  const suspended = watch.status === 'suspended_credits'
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card accent={suspended ? colors.danger : 'watch'} style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt variant="heading" style={{ fontSize: 18 }}>{watch.origin} → {watch.destination}</Txt>
          <StatusBadge status={watch.status} />
        </View>
        <Txt variant="small">
          {watch.destinationCity} · {shortDate(watch.departDate)}
          {watch.returnDate ? ` – ${shortDate(watch.returnDate)}` : ''}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt variant="title" style={{ fontSize: 22 }}>{money(watch.currentPriceCents)}</Txt>
          {watch.lastDropPct ? <PriceDropBadge pct={watch.lastDropPct} /> : null}
          <Txt variant="mono" style={{ marginLeft: 'auto' }}>target {money(watch.targetPriceCents)}</Txt>
        </View>
        {suspended && (
          <View style={{ gap: 8 }}>
            <Txt variant="small">Your watch is paused because you ran out of credits.</Txt>
            {/* Suspended watches ALWAYS offer the top-up CTA — entry point to the Billing flow. */}
            <Button label="Top up credits" accent="ledger" onPress={onTopUp} />
          </View>
        )}
      </Card>
    </Pressable>
  )
}
