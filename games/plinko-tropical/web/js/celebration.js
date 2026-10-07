import { theme } from './theme.js'

// A landing that pays at least BIG_WIN_HUNDREDTHS is celebrated with a burst of
// confetti, the multiplier across the board, and a shake; one that pays at least
// FLASH_WIN_HUNDREDTHS flashes its tile twice. The host's settled multiplier decides
// which; the frame only draws it.
export const BIG_WIN_HUNDREDTHS = 500
export const FLASH_WIN_HUNDREDTHS = 250

export function winTier(hundredths) {
  if (hundredths >= BIG_WIN_HUNDREDTHS) return 'big'
  if (hundredths >= FLASH_WIN_HUNDREDTHS) return 'flash'
  return null
}

const SHAKE_MS = 350
const SHAKE_PX = 5

// The board's offset in frame pixels this long into a shake, easing out to rest; null
// once it is over.
export function shakeOffset(elapsed) {
  const t = elapsed / SHAKE_MS
  if (t >= 1) return null
  const reach = SHAKE_PX * (1 - t) * (1 - t)
  return { x: reach * Math.sin(t * Math.PI * 14), y: reach * 0.6 * Math.cos(t * Math.PI * 10) }
}

const PIECES = 110
const MOST_PARTICLES = 180

// Confetti in the tiles' colours thrown up out of the tile that paid, fluttering back
// down past it. Drawn on its own canvas over the board, and only while any is in the
// air.
export const burst = {
  canvas: null,
  g: null,
  particles: [],
  frameRequest: 0,
  lastFrame: 0,

  mount() {
    this.canvas = document.getElementById('burst')
    this.g = this.canvas.getContext('2d')
  },

  // `x`, `y` is the tile's top and `reach` the stage height the throw scales to.
  fire(x, y, reach) {
    if (!this.g) return
    const scale = Math.max(0.85, reach / 600)
    for (let i = 0; i < PIECES; i++) this.particles.push(piece(x, y, scale))
    this.particles.splice(0, Math.max(0, this.particles.length - MOST_PARTICLES))
    this.wake()
  },

  wake() {
    if (this.frameRequest) return
    this.resize()
    this.lastFrame = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
      this.lastFrame = now
      this.step(dt)
      this.frameRequest = this.particles.length > 0 ? requestAnimationFrame(loop) : 0
    }
    this.frameRequest = requestAnimationFrame(loop)
  },

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.round(this.canvas.clientWidth * ratio)
    const height = Math.round(this.canvas.clientHeight * ratio)
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    this.g.setTransform(ratio, 0, 0, ratio, 0, 0)
  },

  step(dt) {
    const g = this.g
    g.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight)
    this.particles = this.particles.filter((p) => {
      p.age += dt
      if (p.age >= p.life) return false
      p.vx *= Math.exp(-p.drag * dt)
      p.vy = p.vy * Math.exp(-p.drag * dt) + p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.spin += p.spinRate * dt
      const fade = 1 - Math.max(0, (p.age - p.life * 0.6) / (p.life * 0.4))
      drawPiece(g, p, fade)
      return true
    })
  },
}

function piece(x, y, scale) {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8
  const speed = (560 + Math.random() * 620) * scale
  const colours = theme.burst.confetti
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    gravity: 900 * scale,
    drag: 1.6,
    width: (9 + Math.random() * 5) * scale,
    height: (5 + Math.random() * 3) * scale,
    colour: colours[Math.floor(Math.random() * colours.length)],
    tilt: Math.random() * Math.PI,
    spin: Math.random() * Math.PI * 2,
    spinRate: 8 + Math.random() * 12,
    age: 0,
    life: 1.3 + Math.random() * 0.5,
  }
}

// A paper rectangle tumbling end over end: its height follows the flip.
function drawPiece(g, p, fade) {
  g.globalAlpha = fade
  g.fillStyle = p.colour
  g.save()
  g.translate(p.x, p.y)
  g.rotate(p.tilt + p.spin * 0.3)
  const height = Math.max(0.15, Math.abs(Math.cos(p.spin))) * p.height
  g.fillRect(-p.width / 2, -height / 2, p.width, height)
  g.restore()
  g.globalAlpha = 1
}
