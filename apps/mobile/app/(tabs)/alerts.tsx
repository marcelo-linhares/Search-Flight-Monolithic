import { useRouter } from 'expo-router'
import { AlertInboxScreen } from '../../src/modules/notification/screens/AlertInboxScreen'

export default function Alerts() {
  const router = useRouter()
  return <AlertInboxScreen onOpen={(id) => router.push(`/alerts/${id}`)} />
}
