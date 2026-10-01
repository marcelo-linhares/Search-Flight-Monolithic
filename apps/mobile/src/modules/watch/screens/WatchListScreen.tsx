import { ReactNode, useEffect } from 'react'
import { View } from 'react-native'
import { Button, Card, Screen, Txt } from '@searchfly/ui'
import { WatchCard } from '../components/WatchCard'
import { useWatchStore } from '../store'

/** `header` is a slot filled by the route (e.g. Ledger balance chip, low-credits banner) so this module never imports the Ledger store. */
export function WatchListScreen({
  header,
  onOpen,
  onCreate,
  onTopUp,
}: {
  header?: ReactNode
  onOpen: (id: string) => void
  onCreate: () => void
  onTopUp: () => void
}) {
  const { watches, loading, error, load } = useWatchStore()
  useEffect(() => { void load() }, [load])

  return (
    <Screen>
      {header}
      {error && <Card accent="danger"><Txt variant="small">{error}</Txt></Card>}
      {watches.length === 0 && !loading && (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 48 }}>
          <Txt variant="title" style={{ fontSize: 20 }}>No watches yet</Txt>
          <Txt variant="small" style={{ textAlign: 'center' }}>
            Pick a route and we’ll track its fare for you and alert you on a real drop.
          </Txt>
        </View>
      )}
      {watches.map((w) => (
        <WatchCard key={w.id} watch={w} onPress={() => onOpen(w.id)} onTopUp={onTopUp} />
      ))}
      <Button label={watches.length === 0 ? 'Create your first watch' : 'New watch'} onPress={onCreate} />
    </Screen>
  )
}
