import { useRouter } from 'expo-router'
import { CreditBalanceChip } from '../../../src/modules/ledger/components/CreditBalanceChip'
import { LowCreditsBanner } from '../../../src/modules/ledger/components/LowCreditsBanner'
import { WatchListScreen } from '../../../src/modules/watch/screens/WatchListScreen'
import { View } from 'react-native'

/** Route = composition point: fills the Watch list's header slot with Ledger components (no cross-module store imports). */
export default function WatchesIndex() {
  const router = useRouter()
  const topUp = () => router.push('/billing/buy')
  return (
    <WatchListScreen
      header={
        <View style={{ gap: 12, alignItems: 'flex-start' }}>
          <CreditBalanceChip onPress={() => router.push('/(tabs)/credits')} />
          <View style={{ alignSelf: 'stretch' }}><LowCreditsBanner onTopUp={topUp} /></View>
        </View>
      }
      onOpen={(id) => router.push(`/watches/${id}`)}
      onCreate={() => router.push('/create-watch')}
      onTopUp={topUp}
    />
  )
}
