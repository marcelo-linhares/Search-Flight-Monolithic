import { useEffect } from 'react'
import { Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Txt, colors } from '@searchfly/ui'
import { useNotificationStore } from '../store'
import { alertAccent } from './alertStyle'

/** In-app foreground banner for a pushed alert. Auto-dismisses. */
export function AlertBanner({ onOpen }: { onOpen: (alertId: string) => void }) {
  const banner = useNotificationStore((s) => s.banner)
  const dismiss = useNotificationStore((s) => s.dismissBanner)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(dismiss, 5000)
    return () => clearTimeout(t)
  }, [banner, dismiss])

  if (!banner) return null
  return (
    <Pressable
      accessibilityRole="alert"
      onPress={() => { dismiss(); onOpen(banner.id) }}
      style={{
        position: 'absolute', top: insets.top + 8, left: 12, right: 12,
        backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, gap: 2,
        borderColor: alertAccent[banner.kind], borderWidth: 1.5,
      }}
    >
      <Txt variant="heading" style={{ fontSize: 14 }}>{banner.title}</Txt>
      <Txt variant="small">{banner.body}</Txt>
    </Pressable>
  )
}
