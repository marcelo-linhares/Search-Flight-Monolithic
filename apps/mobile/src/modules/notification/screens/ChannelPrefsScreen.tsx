import { Switch, View } from 'react-native'
import { Card, Screen, Txt, colors } from '@searchfly/ui'
import { useNotificationStore } from '../store'

/** Alert configuration lives here (Notification BC) — never inside the Watch creation form. */
export function ChannelPrefsScreen() {
  const { prefs, setPref } = useNotificationStore()
  const rows = [
    { key: 'push', label: 'Push notifications', hint: 'Delivered via APNs / FCM' },
    { key: 'email', label: 'Email', hint: 'Daily summary' },
    { key: 'priceDrops', label: 'Price drop alerts', hint: 'Only significant drops' },
  ] as const
  return (
    <Screen>
      <Card accent="notif" style={{ gap: 14 }}>
        {rows.map((r) => (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="body">{r.label}</Txt>
              <Txt variant="small">{r.hint}</Txt>
            </View>
            <Switch
              value={prefs[r.key]}
              onValueChange={(v) => setPref(r.key, v)}
              trackColor={{ true: colors.notif, false: colors.border }}
            />
          </View>
        ))}
      </Card>
    </Screen>
  )
}
