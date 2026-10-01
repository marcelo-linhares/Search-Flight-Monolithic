import { ActivityIndicator, View } from 'react-native'
import { Button, Card, Screen, Txt, colors } from '@searchfly/ui'
import { money } from '../../../shared/format'
import { useBillingStore } from '../store'

/** S5 (processing) → S6 (confirmed). Confirmation is driven by the BalanceRestored event, not by the checkout response. */
export function PaymentConfirmationScreen({ onDone }: { onDone: () => void }) {
  const { status, result } = useBillingStore()
  const confirmed = status === 'confirmed'

  return (
    <Screen scroll={false} contentStyle={{ justifyContent: 'center' }}>
      <Card accent={confirmed ? 'search' : 'billing'} style={{ gap: 12, alignItems: 'center' }}>
        {confirmed ? (
          <Txt variant="title" color={colors.search} style={{ fontSize: 40 }}>✓</Txt>
        ) : (
          <ActivityIndicator color={colors.billing} size="large" />
        )}
        <Txt variant="title" style={{ fontSize: 20 }}>{confirmed ? 'Credits added' : 'Confirming payment…'}</Txt>
        {result && (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Txt variant="body">{result.credits} credits · {money(result.priceCents)}</Txt>
            <Txt variant="mono">invoice {result.invoiceId}</Txt>
          </View>
        )}
        <Txt variant="small" style={{ textAlign: 'center' }}>
          {confirmed
            ? 'Your paused watches are being reactivated. We’ll tell you as each one resumes.'
            : 'This usually takes a few seconds. You can leave this screen — we’ll notify you.'}
        </Txt>
      </Card>
      <Button label={confirmed ? 'Back to my watches' : 'Continue in background'} accent="billing" variant={confirmed ? 'solid' : 'outline'} onPress={onDone} />
    </Screen>
  )
}
