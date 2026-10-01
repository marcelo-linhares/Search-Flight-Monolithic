import { useRouter } from 'expo-router'
import { CreateWatchScreen } from '../src/modules/watch/screens/CreateWatchScreen'

export default function CreateWatch() {
  const router = useRouter()
  return <CreateWatchScreen onCreated={(id) => router.replace(`/watches/${id}`)} />
}
