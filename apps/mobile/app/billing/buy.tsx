import { useRouter } from 'expo-router'
import { BuyCreditsScreen } from '../../src/modules/billing/screens/BuyCreditsScreen'

export default function Buy() {
  const router = useRouter()
  return <BuyCreditsScreen onPaid={() => router.replace('/billing/confirmation')} />
}
