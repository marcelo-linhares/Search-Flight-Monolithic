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
  /** Brand chrome: default actions, active tab, links, focus (see brand/). Bounded-context colors stay on context-owned data. */
  primary: '#00A3FF',
  /** Text/icons on top of `primary`. Navy, never white (white on Sky fails contrast). */
  onPrimary: '#0B2D5B',
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

/** Brand palette (see brand/): used by the logo and brand moments, not for bounded-context accents. */
export const brand = {
  navy: '#0B2D5B',
  sky: '#00A3FF',
  amber: '#FFB020',
  offWhite: '#F8FAFC',
} as const

export type BcColor = 'watch' | 'search' | 'pricing' | 'notif' | 'billing' | 'ledger'

export const fonts = {
  ui: 'Montserrat_400Regular',
  uiMedium: 'Montserrat_500Medium',
  uiSemi: 'Montserrat_600SemiBold',
  uiBold: 'Montserrat_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_700Bold',
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const
