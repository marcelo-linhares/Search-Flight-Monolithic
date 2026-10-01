import { useState } from 'react'
import { View } from 'react-native'
import { Button, Card, Field, LogoMark, Screen, Txt, colors } from '@searchfly/ui'
import { useAuth } from './store'

export function LoginScreen({ onDone }: { onDone: () => void }) {
  const login = useAuth((s) => s.login)
  const [email, setEmail] = useState('mlinharesdev@gmail.com')
  const [password, setPassword] = useState('demo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true); setError(null)
    try { await login(email.trim(), password); onDone() }
    catch { setError('Could not sign in. Check your details and try again.') }
    finally { setBusy(false) }
  }

  return (
    <Screen contentStyle={{ justifyContent: 'center', gap: 16 }}>
      <View style={{ alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <LogoMark size={96} />
        <Txt variant="title" style={{ fontSize: 32 }}>
          Search<Txt variant="title" color={colors.pricing} style={{ fontSize: 32 }}>Fly</Txt>
        </Txt>
        <Txt variant="small">Track flight prices. Fly for less.</Txt>
      </View>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {error && <Card accent="danger"><Txt variant="small">{error}</Txt></Card>}
      <Button label="Sign in" onPress={submit} loading={busy} />
    </Screen>
  )
}
