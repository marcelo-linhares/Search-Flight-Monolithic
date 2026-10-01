import { View } from 'react-native'
import { Button, Card, Txt, colors } from '@searchfly/ui'
import { LOW_CREDITS_THRESHOLD, useLedgerStore } from '../store'

/** S1 — shown while balance is low but watches are still running. */
export function LowCreditsBanner({ onTopUp }: { onTopUp: () => void }) {
  const balance = useLedgerStore((s) => s.creditBalance)
  if (balance === null || balance > LOW_CREDITS_THRESHOLD) return null
  return (
    <Card accent={colors.notif} style={{ gap: 10 }}>
      <View style={{ gap: 4 }}>
        <Txt variant="heading">{balance === 0 ? 'You are out of credits' : 'Credits running low'}</Txt>
        <Txt variant="small">
          {balance === 0
            ? 'Your watches are paused until you top up.'
            : `Only ${balance} left — each search run uses 1 credit. Top up to keep tracking.`}
        </Txt>
      </View>
      <Button label="Top up credits" accent="ledger" variant="outline" onPress={onTopUp} />
    </Card>
  )
}
