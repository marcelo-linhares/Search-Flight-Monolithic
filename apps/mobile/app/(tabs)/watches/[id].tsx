import { useLocalSearchParams, useRouter } from 'expo-router'
import { PriceHistory } from '../../../src/modules/search/components/PriceHistory'
import { WatchDetailScreen } from '../../../src/modules/watch/screens/WatchDetailScreen'

export default function WatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  if (!id) return null
  return <WatchDetailScreen id={id} chart={<PriceHistory watchId={id} />} onTopUp={() => router.push('/billing/buy')} />
}
