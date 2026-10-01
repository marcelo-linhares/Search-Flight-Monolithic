import { useRouter } from 'expo-router'
import { PaymentConfirmationScreen } from '../../src/modules/billing/screens/PaymentConfirmationScreen'

export default function Confirmation() {
  const router = useRouter()
  return <PaymentConfirmationScreen onDone={() => router.replace('/(tabs)/watches')} />
}
