import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native'
import { BcColor, colors, fonts, radius, space } from './tokens'

type TxtVariant = 'title' | 'heading' | 'body' | 'small' | 'mono' | 'tag'

const variants: Record<TxtVariant, TextStyle> = {
  title: { fontFamily: fonts.uiBold, fontSize: 24, color: colors.text },
  heading: { fontFamily: fonts.uiSemi, fontSize: 16, color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 14, color: colors.text, lineHeight: 20 },
  small: { fontFamily: fonts.ui, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  mono: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTag },
  tag: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.textTag, letterSpacing: 0.6 },
}

export function Txt({
  variant = 'body',
  color,
  style,
  ...rest
}: React.ComponentProps<typeof Text> & { variant?: TxtVariant; color?: string }) {
  return <Text {...rest} style={[variants[variant], color ? { color } : null, style]} />
}

export function Card({
  accent,
  style,
  children,
}: {
  accent?: BcColor | string
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}) {
  const accentColor = accent ? (accent in colors ? colors[accent as BcColor] : accent) : undefined
  return (
    <View
      style={[
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderCard,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: space.lg,
        },
        accentColor ? { borderLeftColor: accentColor, borderLeftWidth: 3 } : null,
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function Button({
  label,
  onPress,
  accent = 'watch',
  variant = 'solid',
  loading,
  disabled,
  testID,
}: {
  label: string
  onPress: () => void
  accent?: BcColor
  variant?: 'solid' | 'outline'
  loading?: boolean
  disabled?: boolean
  testID?: string
}) {
  const c = colors[accent]
  const solid = variant === 'solid'
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: solid ? c : 'transparent',
        borderColor: c,
        borderWidth: 1.5,
        borderRadius: radius.md,
        paddingVertical: 13,
        alignItems: 'center',
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={solid ? colors.bg : c} />
      ) : (
        <Txt variant="heading" color={solid ? colors.bg : c} style={{ fontSize: 14 }}>
          {label}
        </Txt>
      )}
    </Pressable>
  )
}

export function Tag({ label, accent }: { label: string; accent: BcColor | 'danger' }) {
  const c = colors[accent]
  return (
    <View
      style={{
        backgroundColor: c + '22',
        borderRadius: radius.sm,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Txt variant="tag" color={c}>
        {label.toUpperCase()}
      </Txt>
    </View>
  )
}

export function Field({ label, style, ...rest }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="tag">{label.toUpperCase()}</Txt>
      <TextInput
        placeholderTextColor={colors.textTag}
        {...rest}
        style={[
          {
            backgroundColor: colors.bgTag,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
            color: colors.text,
            fontFamily: fonts.ui,
            fontSize: 15,
            paddingHorizontal: 14,
            paddingVertical: 12,
          },
          style,
        ]}
      />
    </View>
  )
}

export function Chip({
  label,
  accent,
  onPress,
}: {
  label: string
  accent: BcColor
  onPress?: () => void
}) {
  const c = colors[accent]
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: c + '1F',
        borderColor: c + '66',
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Txt variant="mono" color={c} style={{ fontFamily: fonts.monoBold, fontSize: 12 }}>
        {label}
      </Txt>
    </Pressable>
  )
}

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: React.ReactNode
  scroll?: boolean
  contentStyle?: StyleProp<ViewStyle>
}) {
  const inner: StyleProp<ViewStyle> = [{ padding: space.lg, gap: space.md, flexGrow: 1 }, contentStyle]
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: colors.bg }, inner]}>{children}</View>
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={inner}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
}
