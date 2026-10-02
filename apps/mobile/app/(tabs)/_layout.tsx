import { Ionicons } from '@expo/vector-icons'
import { Redirect, Tabs } from 'expo-router'
import { colors, fonts } from '@searchfly/ui'
import { selectUnread, useNotificationStore } from '../../src/modules/notification/store'
import { useAuth } from '../../src/shared/auth/store'
import { ColorValue } from 'react-native'

type Icon = React.ComponentProps<typeof Ionicons>['name']
const tab = (title: string, icon: Icon, color: string) => ({
  title,
  tabBarActiveTintColor: color,
  tabBarIcon: ({ color: c, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} size={size} color={c} />,
})

export default function TabsLayout() {
  const user = useAuth((s) => s.user)
  const unread = useNotificationStore(selectUnread)
  if (!user) return <Redirect href="/(auth)/login" />

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.uiSemi },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.bgCard, borderTopColor: colors.border },
        tabBarInactiveTintColor: colors.textTag,
        tabBarLabelStyle: { fontFamily: fonts.uiMedium, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="watches" options={{ ...tab('Watches', 'airplane-outline', colors.watch), headerShown: false }} />
      <Tabs.Screen
        name="alerts"
        options={{ ...tab('Alerts', 'notifications-outline', colors.notif), tabBarBadge: unread > 0 ? unread : undefined }}
      />
      <Tabs.Screen name="credits" options={tab('Credits', 'wallet-outline', colors.ledger)} />
      <Tabs.Screen name="profile" options={tab('Profile', 'person-outline', colors.textLink)} />
    </Tabs>
  )
}
