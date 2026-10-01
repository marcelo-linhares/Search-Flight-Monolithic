import { bus } from '../../shared/bus'
import { useSearchStore } from './store'

export function registerSearchEvents(): () => void {
  // A price drop means a fresh snapshot exists server-side: refresh the chart data.
  return bus.on('PriceDropDetected', (e) => void useSearchStore.getState().load(e.watchId))
}
