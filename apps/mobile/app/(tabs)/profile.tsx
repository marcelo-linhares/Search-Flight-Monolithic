import { useRouter } from 'expo-router'
import { ProfileScreen } from '../../src/shared/profile/ProfileScreen'

export default function Profile() {
  const router = useRouter()
  return <ProfileScreen onPrefs={() => router.push('/notification-prefs')} onSignedOut={() => router.replace('/(auth)/login')} />
}
