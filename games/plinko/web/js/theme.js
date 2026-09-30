// The board's own colours. They are game art, not platform chrome, so they live here
// rather than in the platform tokens. Each band shades a cup's glass from deep to
// light, paints its label in `ink`, and spills `glow` onto the tray around it.
const bands = [
  { deep: '#7d879a', base: '#bcc4d1', hi: '#dde3ec', light: '#ffffff', ink: '#141a24', shade: 0.12, glow: '#eef4ff' },
  { deep: '#006a58', base: '#00d9b8', hi: '#3cf0d2', light: '#aefcee', ink: '#ffffff', shade: 0.35, glow: '#2ef5d6' },
  { deep: '#2e0a8a', base: '#6a1eff', hi: '#8f55ff', light: '#c9adff', ink: '#ffffff', shade: 0.35, glow: '#8d55ff' },
  { deep: '#8a3600', base: '#ff8a00', hi: '#ffa630', light: '#ffd690', ink: '#ffffff', shade: 0.35, glow: '#ffa028' },
  { deep: '#7a0020', base: '#f5003a', hi: '#ff4d78', light: '#ff9ab2', ink: '#ffffff', shade: 0.35, glow: '#ff3a6a' },
]

export const theme = {
  ground: 0x05070b,

  labelFont(size) {
    return `700 ${size}px Inter, "IBM Plex Sans", sans-serif`
  },

  // By distance from the centre: silver in the middle, then teal, purple, orange, and
  // red at the edge where the pay is highest.
  cupBand(index, total) {
    const distance = Math.round(Math.abs(index - (total - 1) / 2))
    return bands[Math.min(distance, bands.length - 1)]
  },
}
