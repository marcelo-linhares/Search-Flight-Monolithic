import { useState } from 'react'
import { Button, Card, Field, Screen, Txt } from '@searchfly/ui'
import { airportByCode } from '../../../shared/format/airports'
import { useWatchStore } from '../store'

const isoDate = /^\d{4}-\d{2}-\d{2}$/

export function CreateWatchScreen({ onCreated }: { onCreated: (id: string) => void }) {
  const create = useWatchStore((s) => s.create)
  const [origin, setOrigin] = useState('GRU')
  const [destination, setDestination] = useState('')
  const [depart, setDepart] = useState('')
  const [ret, setRet] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const o = airportByCode(origin)
    const d = airportByCode(destination)
    const targetReais = Number(target.replace(',', '.'))
    if (!o || !d) return setError('Use airport codes like GRU, LHR, LIS, CDG, MAD, JFK, GIG or EZE.')
    if (o.code === d.code) return setError('Origin and destination must differ.')
    if (!isoDate.test(depart)) return setError('Departure date must be YYYY-MM-DD.')
    if (ret && !isoDate.test(ret)) return setError('Return date must be YYYY-MM-DD.')
    if (!Number.isFinite(targetReais) || targetReais <= 0) return setError('Enter a target price in R$.')
    setError(null)
    setBusy(true)
    try {
      const w = await create({
        origin: o.code, destination: d.code, departDate: depart,
        returnDate: ret || undefined, targetPriceCents: Math.round(targetReais * 100),
      })
      onCreated(w.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the watch.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Field label="From" value={origin} onChangeText={setOrigin} autoCapitalize="characters" maxLength={3} />
      <Field label="To" value={destination} onChangeText={setDestination} autoCapitalize="characters" maxLength={3} placeholder="LHR" />
      <Field label="Departure (YYYY-MM-DD)" value={depart} onChangeText={setDepart} placeholder="2026-12-10" keyboardType="numbers-and-punctuation" />
      <Field label="Return (optional)" value={ret} onChangeText={setRet} placeholder="2026-12-24" keyboardType="numbers-and-punctuation" />
      <Field label="Alert me below (R$)" value={target} onChangeText={setTarget} placeholder="2600" keyboardType="decimal-pad" />
      {error && <Card accent="danger"><Txt variant="small">{error}</Txt></Card>}
      <Button label="Start watching" onPress={submit} loading={busy} />
      <Txt variant="small">Each search run uses 1 credit. Alert channels are managed in Profile → Notification preferences.</Txt>
    </Screen>
  )
}
