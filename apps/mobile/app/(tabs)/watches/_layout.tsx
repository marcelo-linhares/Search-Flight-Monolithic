import { Stack } from 'expo-router'
import { colors, fonts } from '@searchfly/ui'

export default function WatchesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.uiSemi },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My watches' }} />
      <Stack.Screen name="[id]" options={{ title: 'Watch' }} />
    </Stack>
  )
}
