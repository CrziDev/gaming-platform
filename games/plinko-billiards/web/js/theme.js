// The table's own colours. They are game art, not platform chrome, so they live here
// rather than in the platform tokens. Each band enamels a pocket's plate from deep to
// light, paints its label in `ink`, and lights the cloth around the pocket in `glow`.
const bands = [
  { deep: '#a8987a', base: '#e9dfc6', hi: '#fffaf0', ink: '#241a10', shade: 0.1, glow: '#ffeccb' },
  { deep: '#0a2a70', base: '#1d58cc', hi: '#5c8ff0', ink: '#ffffff', shade: 0.35, glow: '#4f8cff' },
  { deep: '#2f0f58', base: '#6428ae', hi: '#9a63e0', ink: '#ffffff', shade: 0.35, glow: '#9b5cff' },
  { deep: '#7c3000', base: '#ea7010', hi: '#ffa650', ink: '#ffffff', shade: 0.35, glow: '#ff9a30' },
  { deep: '#640812', base: '#cf1c2a', hi: '#ff5a64', ink: '#ffffff', shade: 0.35, glow: '#ff4050' },
]

// The solids 1–8; a stripe wears the colour of its number less eight.
const ballColours = ['#f2b705', '#1846b8', '#cf1f2b', '#57287f', '#ee6a10', '#127040', '#7a1d1d', '#101010']

export const theme = {
  ground: 0x080605,

  // The cue ball's ivory smear, the light and dark of the nap it brushes on the cloth,
  // and the blue of the chalk a strike knocks off.
  trail: { smear: '#f3eee2', napLight: '#a9e0bf', napDark: '#03140b', chalk: '#5d8fd8' },

  labelFont(size) {
    return `700 ${size}px Inter, "IBM Plex Sans", sans-serif`
  },

  // By distance from the centre: ivory in the middle, then blue, purple, orange, and
  // red at the edge where the pay is highest.
  cupBand(index, total) {
    const distance = Math.round(Math.abs(index - (total - 1) / 2))
    return bands[Math.min(distance, bands.length - 1)]
  },

  ballColour(number) {
    return ballColours[(number - 1) % 8]
  },
}
