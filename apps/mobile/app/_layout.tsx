import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter'
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono'
import { colors, fonts } from '@searchfly/ui'
import { registerAllEvents } from '../src/bootstrap'
import { AlertBanner } from '../src/modules/notification/components/AlertBanner'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const router = useRouter()
  const [loaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    JetBrainsMono_400Regular, JetBrainsMono_700Bold,
  })

  useEffect(() => registerAllEvents(), [])
  useEffect(() => { if (loaded) void SplashScreen.hideAsync() }, [loaded])
  if (!loaded) return null

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontFamily: fonts.uiSemi },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="create-watch" options={{ title: 'New watch', presentation: 'modal' }} />
          <Stack.Screen name="notification-prefs" options={{ title: 'Notification preferences' }} />
          <Stack.Screen name="alerts/[id]" options={{ title: 'Alert' }} />
          <Stack.Screen name="billing/buy" options={{ title: 'Buy credits' }} />
          <Stack.Screen name="billing/confirmation" options={{ title: 'Payment', headerBackVisible: false }} />
        </Stack>
        <AlertBanner onOpen={(id) => router.push(`/alerts/${id}`)} />
      </View>
    </SafeAreaProvider>
  )
}
