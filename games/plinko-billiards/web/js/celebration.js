import { theme } from './theme.js'

// A landing that pays at least BIG_WIN_HUNDREDTHS is celebrated with a burst of coins,
// the multiplier across the table, and a shake; one that pays at least
// FLASH_WIN_HUNDREDTHS flashes its pocket twice. The host's settled multiplier decides
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

// The table's offset in frame pixels this long into a shake, easing out to rest; null
// once it is over.
export function shakeOffset(elapsed) {
  const t = elapsed / SHAKE_MS
  if (t >= 1) return null
  const reach = SHAKE_PX * (1 - t) * (1 - t)
  return { x: reach * Math.sin(t * Math.PI * 14), y: reach * 0.6 * Math.cos(t * Math.PI * 10) }
}

const COINS = 56
const PUFFS = 22
const MOST_PARTICLES = 180

// Gold coins thrown up out of the pocket that paid in a cloud of blue chalk, falling
// back past it. Drawn on their own canvas over the table, and only while any are in
// the air.
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

  // `x`, `y` is the pocket's mouth and `reach` the stage height the throw scales to.
  fire(x, y, reach) {
    if (!this.g) return
    const scale = Math.max(0.85, reach / 600)
    for (let i = 0; i < COINS; i++) this.particles.push(coin(x, y, scale))
    for (let i = 0; i < PUFFS; i++) this.particles.push(puff(x, y, scale))
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
      if (p.kind === 'coin') drawCoin(g, p, fade)
      else drawPuff(g, p, fade)
      return true
    })
  },
}

function coin(x, y, scale) {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
  const speed = (520 + Math.random() * 560) * scale
  return {
    kind: 'coin',
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    gravity: 1500 * scale,
    drag: 0.6,
    radius: (7 + Math.random() * 4) * scale,
    spin: Math.random() * Math.PI * 2,
    spinRate: 6 + Math.random() * 10,
    age: 0,
    life: 1.2 + Math.random() * 0.4,
  }
}

function puff(x, y, scale) {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.6
  const speed = (120 + Math.random() * 320) * scale
  return {
    kind: 'puff',
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    gravity: -40 * scale,
    drag: 3,
    radius: (5 + Math.random() * 6) * scale,
    spin: 0,
    spinRate: 0,
    age: 0,
    life: 0.7 + Math.random() * 0.5,
  }
}

// A coin turning about its vertical axis: its width follows the turn, and its face
// darkens to the rim as it goes edge-on.
function drawCoin(g, p, fade) {
  const { face, rim, shine } = theme.burst.coin
  const turn = Math.cos(p.spin)
  const width = Math.max(0.12, Math.abs(turn)) * p.radius
  g.globalAlpha = fade
  g.fillStyle = rim
  g.beginPath()
  g.ellipse(p.x, p.y, width, p.radius, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = Math.abs(turn) > 0.35 ? face : rim
  g.beginPath()
  g.ellipse(p.x, p.y, width * 0.78, p.radius * 0.78, 0, 0, Math.PI * 2)
  g.fill()
  if (turn > 0.5) {
    g.fillStyle = shine
    g.beginPath()
    g.ellipse(p.x - width * 0.25, p.y - p.radius * 0.3, width * 0.22, p.radius * 0.18, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
}

// A soft cloud of chalk that spreads as it thins.
function drawPuff(g, p, fade) {
  const radius = p.radius * (1 + (p.age / p.life) * 1.6)
  g.globalAlpha = fade * 0.5
  g.fillStyle = theme.burst.chalk
  g.beginPath()
  g.arc(p.x, p.y, radius, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
}
