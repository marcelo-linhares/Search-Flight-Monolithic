import React from 'react'
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { brand } from './tokens'
import { MARK, MARK_GRADIENTS } from './logoPaths'

/**
 * SearchFly logomark: an "S" drawn as a flight route, from the amber origin dot to a paper plane.
 * Source of truth: /brand/mark.svg (geometry lives in ./logoPaths.ts, generated from it).
 *
 * - `size` is the width of the mark; height follows the artwork's aspect ratio (≈ 1.2 : 1).
 * - `variant` picks the gradient set: 'dark' for dark surfaces (the app default), 'light' for light ones.
 * - `simple` thickens the strokes and enlarges the dot. Use it under ~32px (mirrors /brand/mark-small.svg).
 */
export function LogoMark({
  size = 64,
  simple = false,
  variant = 'dark',
}: {
  size?: number
  simple?: boolean
  variant?: 'dark' | 'light'
}) {
  const [x, y, w, h] = MARK.viewBox
  const up = variant === 'dark' ? 'sfUpD' : 'sfUp'
  const lo = variant === 'dark' ? 'sfLoD' : 'sfLo'
  const fat = simple ? ({ strokeWidth: 5, strokeLinejoin: 'round' } as const) : {}
  return (
    <Svg width={size} height={(size * h) / w} viewBox={`${x} ${y} ${w} ${h}`} accessibilityLabel="SearchFly logo">
      <Defs>
        {Object.entries(MARK_GRADIENTS).map(([id, g]) => (
          <LinearGradient key={id} id={id} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
            {g.stops.map(([offset, color]) => (
              <Stop key={offset} offset={offset} stopColor={color} />
            ))}
          </LinearGradient>
        ))}
      </Defs>
      <Path d={MARK.upper} fill={`url(#${up})`} stroke={`url(#${up})`} {...fat} />
      <Path d={MARK.lower} fill={`url(#${lo})`} stroke={`url(#${lo})`} {...fat} />
      <Path
        d={MARK.arrow}
        fill="url(#sfArrow)"
        stroke="url(#sfArrow)"
        strokeWidth={simple ? 5 : 2.6}
        strokeLinejoin="round"
      />
      <Circle cx={MARK.dot.cx} cy={MARK.dot.cy} r={MARK.dot.r + (simple ? 3 : 0)} fill={brand.amber} />
    </Svg>
  )
}
