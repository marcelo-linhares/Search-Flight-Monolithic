export const colors = {
  bg: '#0C1018',
  bgCard: '#131825',
  bgTag: '#0A0E18',
  border: '#1C2438',
  borderCard: '#1D2540',
  text: '#EDF0F7',
  textMuted: '#8493AC',
  textTag: '#5C6D87',
  textLink: '#5C7FBF',
  danger: '#EF4444',

  // BC accent palette
  watch: '#A855F7',
  search: '#22C55E',
  scheduler: '#10B981',
  pricing: '#F97316',
  notif: '#EAB308',
  integ: '#6366F1',
  billing: '#EC4899',
  ledger: '#06B6D4',
} as const

export type BcColor = 'watch' | 'search' | 'pricing' | 'notif' | 'billing' | 'ledger'

export const fonts = {
  ui: 'Inter_400Regular',
  uiMedium: 'Inter_500Medium',
  uiSemi: 'Inter_600SemiBold',
  uiBold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_700Bold',
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const
