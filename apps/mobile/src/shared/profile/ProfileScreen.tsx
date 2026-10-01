import { Alert, View } from 'react-native'
import { Button, Card, Screen, Txt } from '@searchfly/ui'
import { USE_MOCK } from '../api'
import { mockControls } from '../api/mock/server'
import { useAuth } from '../auth/store'

export function ProfileScreen({ onPrefs, onSignedOut }: { onPrefs: () => void; onSignedOut: () => void }) {
  const { user, logout } = useAuth()
  return (
    <Screen>
      <Card accent="watch" style={{ gap: 4 }}>
        <Txt variant="heading">{user?.name}</Txt>
        <Txt variant="small">{user?.email}</Txt>
      </Card>
      <Button label="Notification preferences" accent="notif" variant="outline" onPress={onPrefs} />

      {USE_MOCK && (
        <Card style={{ gap: 10 }}>
          <Txt variant="tag">DEMO CONTROLS · MOCK SERVER</Txt>
          <Txt variant="small">Simulate server-side events to exercise the flows without the backend.</Txt>
          <View style={{ gap: 8 }}>
            <Button label="Low credits (S1)" accent="ledger" variant="outline"
              onPress={() => { mockControls.setLowCredits(); Alert.alert('Balance set to 2. Open Watches.') }} />
            <Button label="P0 · Exhaust credits" accent="billing" variant="outline"
              onPress={() => void mockControls.exhaustCredits()} />
            <Button label="Price drop" accent="pricing" variant="outline"
              onPress={() => void mockControls.priceDrop()} />
          </View>
        </Card>
      )}
      <Button label="Sign out" accent="watch" variant="outline" onPress={() => { logout(); onSignedOut() }} />
    </Screen>
  )
}
