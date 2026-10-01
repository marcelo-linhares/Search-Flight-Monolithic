import { Pressable, View } from 'react-native'
import { Card, Txt } from '@searchfly/ui'
import type { AlertDTO } from '@searchfly/domain-events'
import { timeAgo } from '../../../shared/format'
import { alertAccent } from './alertStyle'

export function AlertRow({ alert, onPress }: { alert: AlertDTO; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card accent={alertAccent[alert.kind]} style={{ gap: 4, opacity: alert.read ? 0.65 : 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt variant="heading" style={{ fontSize: 14, flex: 1 }}>{alert.title}</Txt>
          <Txt variant="mono">{timeAgo(alert.createdAt)}</Txt>
        </View>
        <Txt variant="small">{alert.body}</Txt>
      </Card>
    </Pressable>
  )
}
