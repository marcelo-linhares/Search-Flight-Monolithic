import React from 'react'
import Svg, { Circle, Ellipse, G, Line, Path } from 'react-native-svg'
import { colors } from './tokens'

/**
 * SearchFly logomark: a fly-shaped aircraft (jet wings, insect eyes) seen through a magnifying glass.
 * Source of truth: /brand/mark.svg. `simple` drops the body segments and thickens the lens — use it under ~32px.
 */
export function LogoMark({ size = 64, simple = false }: { size?: number; simple?: boolean }) {
  const wing = { fill: colors.billing, fillOpacity: 0.32, stroke: colors.billing, strokeLinejoin: 'round' as const }
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="SearchFly logo">
      <Circle cx={27} cy={27} r={21} fill={colors.bg} stroke={colors.watch} strokeWidth={simple ? 4 : 3} />
      <Line x1={42.5} y1={42.5} x2={58} y2={58} stroke={colors.billing} strokeWidth={6.5} strokeLinecap="round" />
      <G transform="translate(27 27) scale(0.84) translate(-27 -30.5)">
        <Path d="M24 23.5 L6.5 38.5 Q5.4 41 8.4 40.6 L24.5 34.2 Z" {...wing} strokeWidth={1.7} />
        <Path d="M30 23.5 L47.5 38.5 Q48.6 41 45.6 40.6 L29.5 34.2 Z" {...wing} strokeWidth={1.7} />
        <Path d="M25.2 40 L19.5 45.2 Q19 46.6 20.6 46.2 L25.6 43.6 Z" {...wing} strokeWidth={1.5} />
        <Path d="M28.8 40 L34.5 45.2 Q35 46.6 33.4 46.2 L28.4 43.6 Z" {...wing} strokeWidth={1.5} />
        <Path d="M27 21 C31.6 23 31.6 34 27 48 C22.4 34 22.4 23 27 21 Z" fill={colors.pricing} />
        {!simple && (
          <G stroke={colors.bg} strokeOpacity={0.55} strokeWidth={1} strokeLinecap="round">
            <Path d="M24.4 31.5 H29.6" />
            <Path d="M24.9 36.5 H29.1" />
          </G>
        )}
        <Circle cx={27} cy={23.6} r={4.3} fill={colors.pricing} />
        <Circle cx={27} cy={17} r={3.5} fill={colors.pricing} />
        <Ellipse cx={24.5} cy={16.4} rx={1.7} ry={2} fill={colors.billing} />
        <Ellipse cx={29.5} cy={16.4} rx={1.7} ry={2} fill={colors.billing} />
      </G>
    </Svg>
  )
}
