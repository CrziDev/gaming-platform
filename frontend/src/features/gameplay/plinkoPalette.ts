// The supplied game's bucket palette, kept as flat fills. It is game art, not
// chrome, so it lives outside the design tokens; the frame carries the same
// values as CSS custom properties in games/plinko/web/css/plinko.css.
export type PlinkoBand = 'red' | 'orange' | 'purple' | 'teal' | 'lavender'

export const PLINKO_BANDS: Record<PlinkoBand, { fill: string; ink: string }> = {
  red: { fill: '#ff1e56', ink: '#ffffff' },
  orange: { fill: '#ff9e00', ink: '#ffffff' },
  purple: { fill: '#9d4edd', ink: '#ffffff' },
  teal: { fill: '#20e3b2', ink: '#0b3d33' },
  lavender: { fill: '#ebdffd', ink: '#5d2682' },
}

// By distance from the centre of the ribbon: the edge pays most and reads red.
export function plinkoBand(slot: number, total: number): PlinkoBand {
  const centre = (total - 1) / 2
  const distance = centre === 0 ? 0 : Math.abs(slot - centre) / centre
  if (distance > 0.8) return 'red'
  if (distance > 0.6) return 'orange'
  if (distance > 0.4) return 'purple'
  if (distance > 0.2) return 'teal'
  return 'lavender'
}
