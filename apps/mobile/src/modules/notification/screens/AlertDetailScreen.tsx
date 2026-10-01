import { useEffect } from 'react'
import { Button, Card, Screen, Txt } from '@searchfly/ui'
import { timeAgo } from '../../../shared/format'
import { alertAccent } from '../components/alertStyle'
import { useNotificationStore } from '../store'

export function AlertDetailScreen({
  id, onOpenWatch, onTopUp,
}: { id: string; onOpenWatch: (watchId: string) => void; onTopUp: () => void }) {
  const alert = useNotificationStore((s) => s.alerts.find((a) => a.id === id))
  const markRead = useNotificationStore((s) => s.markRead)
  useEffect(() => { if (alert && !alert.read) markRead(id) }, [alert, id, markRead])

  if (!alert) return <Screen><Txt variant="small">Alert not found.</Txt></Screen>
  return (
    <Screen>
      <Card accent={alertAccent[alert.kind]} style={{ gap: 8 }}>
        <Txt variant="title" style={{ fontSize: 20 }}>{alert.title}</Txt>
        <Txt variant="body">{alert.body}</Txt>
        <Txt variant="mono">{timeAgo(alert.createdAt)}</Txt>
      </Card>
      {alert.watchId && <Button label="View watch" onPress={() => onOpenWatch(alert.watchId!)} />}
      {alert.kind === 'watch_suspended' && <Button label="Top up credits" accent="ledger" onPress={onTopUp} />}
    </Screen>
  )
}
