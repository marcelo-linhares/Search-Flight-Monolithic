import { useLocalSearchParams, useRouter } from 'expo-router'
import { AlertDetailScreen } from '../../src/modules/notification/screens/AlertDetailScreen'

export default function AlertDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  if (!id) return null
  return <AlertDetailScreen id={id} onOpenWatch={(w) => router.push(`/watches/${w}`)} onTopUp={() => router.push('/billing/buy')} />
}
