import { useEffect } from 'react'
import { Screen, Txt } from '@searchfly/ui'
import { AlertRow } from '../components/AlertRow'
import { useNotificationStore } from '../store'

export function AlertInboxScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const { alerts, load } = useNotificationStore()
  useEffect(() => { void load() }, [load])
  return (
    <Screen>
      {alerts.length === 0 && <Txt variant="small">No alerts yet. Price drops and watch updates show up here.</Txt>}
      {alerts.map((a) => <AlertRow key={a.id} alert={a} onPress={() => onOpen(a.id)} />)}
    </Screen>
  )
}
