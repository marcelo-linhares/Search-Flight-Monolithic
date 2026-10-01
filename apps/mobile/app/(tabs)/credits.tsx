import { useRouter } from 'expo-router'
import { CreditsScreen } from '../../src/modules/ledger/screens/CreditsScreen'

export default function Credits() {
  const router = useRouter()
  return <CreditsScreen onBuy={() => router.push('/billing/buy')} />
}
