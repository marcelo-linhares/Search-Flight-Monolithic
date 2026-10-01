import { useEffect } from 'react'
import { View } from 'react-native'
import { Button, Card, Screen, Txt, colors } from '@searchfly/ui'
import { timeAgo } from '../../../shared/format'
import { useLedgerStore } from '../store'

export function CreditsScreen({ onBuy }: { onBuy: () => void }) {
  const { creditBalance, entries, loadBalance, loadHistory } = useLedgerStore()
  useEffect(() => { void loadBalance(); void loadHistory() }, [loadBalance, loadHistory])

  return (
    <Screen>
      <Card accent="ledger" style={{ gap: 6 }}>
        <Txt variant="tag">CREDIT BALANCE · LEDGER</Txt>
        <Txt variant="title" color={colors.ledger} style={{ fontSize: 40 }}>{creditBalance ?? '–'}</Txt>
        <Txt variant="small">Each search run debits 1 credit.</Txt>
      </Card>
      <Button label="Buy credits" accent="billing" onPress={onBuy} />
      <Txt variant="tag" style={{ marginTop: 8 }}>HISTORY</Txt>
      {entries.length === 0 && <Txt variant="small">No credit activity yet.</Txt>}
      {entries.map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
          <View style={{ flex: 1 }}>
            <Txt variant="body">{e.reason}</Txt>
            <Txt variant="mono">{timeAgo(e.createdAt)}</Txt>
          </View>
          <Txt variant="heading" color={e.kind === 'credit' ? colors.search : colors.textMuted}>
            {e.kind === 'credit' ? '+' : '−'}{e.amount}
          </Txt>
        </View>
      ))}
    </Screen>
  )
}
