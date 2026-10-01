import { Tag } from '@searchfly/ui'
import type { WatchStatus } from '@searchfly/domain-events'

const map: Record<WatchStatus, { label: string; accent: 'search' | 'notif' | 'danger' | 'watch' }> = {
  active: { label: 'Tracking', accent: 'search' },
  suspended_credits: { label: 'Paused · no credits', accent: 'danger' },
  expired: { label: 'Expired', accent: 'watch' },
  cancelled: { label: 'Cancelled', accent: 'watch' },
}

export function StatusBadge({ status }: { status: WatchStatus }) {
  const m = map[status]
  return <Tag label={m.label} accent={m.accent} />
}
