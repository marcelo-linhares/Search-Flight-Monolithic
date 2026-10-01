import { useRouter } from 'expo-router'
import { LoginScreen } from '../../src/shared/auth/LoginScreen'

export default function Login() {
  const router = useRouter()
  return <LoginScreen onDone={() => router.replace('/(tabs)/watches')} />
}
