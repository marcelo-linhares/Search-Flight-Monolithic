import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import { Button, Card, Screen, Tag, Txt, colors } from '@searchfly/ui'
import { money } from '../../../shared/format'
import { useBillingStore } from '../store'

export function BuyCreditsScreen({ onPaid }: { onPaid: () => void }) {
  const { packs, selectedPackId, status, loadPacks, select, pay, reset } = useBillingStore()
  useEffect(() => { reset(); void loadPacks() }, [loadPacks, reset])

  const selected = packs.find((p) => p.id === selectedPackId)

  async function submit() {
    await pay()
    if (useBillingStore.getState().status === 'processing') onPaid()
  }

  return (
    <Screen>
      <Txt variant="small">Credits are used 1 per search run. Bigger packs cost less per credit.</Txt>
      {packs.map((p) => {
        const active = p.id === selectedPackId
        return (
          <Pressable key={p.id} onPress={() => select(p.id)} accessibilityRole="radio" accessibilityState={{ selected: active }}>
            <Card style={{ borderColor: active ? colors.billing : colors.borderCard, borderWidth: active ? 2 : 1, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="heading">{p.name}</Txt>
                {p.recommended && <Tag label="Popular" accent="billing" />}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Txt variant="title" style={{ fontSize: 22 }}>{p.credits} credits</Txt>
                <Txt variant="heading">{money(p.priceCents)}</Txt>
              </View>
              <Txt variant="mono">{money(Math.round(p.priceCents / p.credits))}/credit</Txt>
            </Card>
          </Pressable>
        )
      })}
      {status === 'error' && <Card accent="danger"><Txt variant="small">Payment failed. Try again.</Txt></Card>}
      <Button
        label={selected ? `Buy ${selected.name} · ${money(selected.priceCents)}` : 'Buy'}
        accent="billing"
        loading={status === 'paying'}
        disabled={!selected}
        onPress={submit}
      />
      <Txt variant="mono" style={{ textAlign: 'center' }}>Powered by Stripe · TLS encrypted</Txt>
    </Screen>
  )
}
