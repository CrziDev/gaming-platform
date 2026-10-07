// The board's own colours. They are game art, not platform chrome, so they live here
// rather than in the platform tokens. Each band shades a tile's face from `hi` through
// `base` to `deep`, paints its label in `ink`, and spills `glow` onto the tray floor
// and, when it is landed in, up the slate.
const bands = [
  { deep: '#97a3b6', base: '#dfe5ee', hi: '#ffffff', ink: '#16202c', shade: 0.12, glow: '#eef4ff' },
  { deep: '#0a3aa8', base: '#1e7bff', hi: '#6cb2ff', ink: '#ffffff', shade: 0.4, glow: '#3a8bff' },
  { deep: '#067a49', base: '#16c47a', hi: '#62f0ae', ink: '#ffffff', shade: 0.4, glow: '#2ee08f' },
  { deep: '#b47400', base: '#ffbf14', hi: '#ffe27a', ink: '#ffffff', shade: 0.5, glow: '#ffc933' },
  { deep: '#b34000', base: '#ff7a1a', hi: '#ffad62', ink: '#ffffff', shade: 0.42, glow: '#ff8a2a' },
  { deep: '#a0001f', base: '#ff2a4a', hi: '#ff7d90', ink: '#ffffff', shade: 0.42, glow: '#ff3a5a' },
]

export const theme = {
  ground: 0x0a1822,

  // The slate face, its rim, and what hangs on it. The rim is a steel-blue channel
  // between pale gold lips, stepping down to the face over a bronze ledge.
  slate: { base: '#18212d', lift: 'rgba(64,84,112,.55)', clear: 'rgba(64,84,112,0)' },
  gold: 0xe9c47e,
  lip: 0xf6dfaa,
  steel: 0x8aaac2,
  steelTone: 0x5a7a8c,
  bronze: 0x8a5a2a,
  groove: 0x140e08,
  bulb: '#fff1d6',
  bulbGlow: '#ffa64a',
  chute: '#3d9dff',
  chuteBack: 0x0a1630,

  // The ball's light streak and the glints a struck peg throws.
  trail: { streak: '#c9f3ff', spark: '#ffe2a0' },

  // The confetti a big win throws out of its tile: the bands' faces and the rim's gold.
  burst: { confetti: ['#ffffff', '#1e7bff', '#16c47a', '#ffbf14', '#ff7a1a', '#ff2a4a', '#e9c47e'] },

  labelFont(size) {
    return `700 ${size}px Inter, "IBM Plex Sans", sans-serif`
  },

  // By distance from the centre: pearl in the middle, then blue, green, yellow, orange,
  // and red at the edge where the pay is highest.
  cupBand(index, total) {
    const distance = Math.round(Math.abs(index - (total - 1) / 2))
    return bands[Math.min(distance, bands.length - 1)]
  },
}
