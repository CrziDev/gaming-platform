const read = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

let palette = null

function load() {
  palette = {
    surface1: read('--color-surface-1'),
    surface2: read('--color-surface-2'),
    surface3: read('--color-surface-3'),
    panel: read('--color-panel'),
    ink: read('--color-ink'),
    inkSoft: read('--color-ink-soft'),
    inkMute: read('--color-ink-mute'),
    accent: read('--color-accent'),
    accentInk: read('--color-accent-ink'),
    onAccent: read('--color-on-accent'),
    gold: read('--color-gold'),
    onGold: read('--color-on-gold'),
    win: read('--color-win'),
    red: read('--plinko-red'),
    orange: read('--plinko-orange'),
    purple: read('--plinko-purple'),
    teal: read('--plinko-teal'),
    tealInk: read('--plinko-teal-ink'),
    lavender: read('--plinko-lavender'),
    lavenderInk: read('--plinko-lavender-ink'),
    ball: read('--plinko-ball'),
    pegHit: read('--plinko-peg-hit'),
    mono: read('--font-mono') || 'ui-monospace, monospace',
  }
  return palette
}

export const theme = {
  get colors() {
    return palette ?? load()
  },

  // The supplied game's bands by distance from the centre, as flat fills: red at
  // the edge where the pay is highest, then orange, purple, teal, lavender.
  bucketBand(index, total) {
    const colors = this.colors
    const centre = (total - 1) / 2
    const distance = centre === 0 ? 0 : Math.abs(index - centre) / centre
    if (distance > 0.8) return { fill: colors.red, ink: colors.ink }
    if (distance > 0.6) return { fill: colors.orange, ink: colors.ink }
    if (distance > 0.4) return { fill: colors.purple, ink: colors.ink }
    if (distance > 0.2) return { fill: colors.teal, ink: colors.tealInk }
    return { fill: colors.lavender, ink: colors.lavenderInk }
  },
}
