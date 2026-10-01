import { Redirect } from 'expo-router'
import { useAuth } from '../src/shared/auth/store'

export default function Index() {
  const user = useAuth((s) => s.user)
  return <Redirect href={user ? '/(tabs)/watches' : '/(auth)/login'} />
}
