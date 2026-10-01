import { Tag } from '@searchfly/ui'

/** Pricing BC — display-only badge, rendered on the watch card when PriceDropDetected arrives. */
export function PriceDropBadge({ pct }: { pct: number }) {
  return <Tag label={`↓ ${pct}%`} accent="pricing" />
}
