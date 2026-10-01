import type { AlertKind } from '@searchfly/domain-events'
import { colors } from '@searchfly/ui'

export const alertAccent: Record<AlertKind, string> = {
  price_drop: colors.pricing,
  watch_suspended: colors.danger,
  watch_reactivated: colors.search,
  balance_restored: colors.ledger,
  watch_created: colors.watch,
}
