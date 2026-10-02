import { theme } from '../theme.js'
import { seeded } from './geometry.js'

// Builders shared by every part of the table: canvas-drawn textures and additive glow
// sprites.
export function createKit(T, scene) {
  // Adds colour on top of what is behind without darkening it.
  const additive = {
    blending: T.CustomBlending,
    blendEquation: T.AddEquation,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  }

  function canvasTexture(draw, width, height = width, { colour = true, repeat = false } = {}) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    draw(canvas.getContext('2d'), width, height)
    const texture = new T.CanvasTexture(canvas)
    texture.colorSpace = colour ? T.SRGBColorSpace : T.NoColorSpace
    texture.anisotropy = 8
    if (repeat) texture.wrapS = texture.wrapT = T.RepeatWrapping
    return texture
  }

  function radialTexture(stops, size = 128) {
    return canvasTexture((g) => {
      const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      for (const [offset, color] of stops) gradient.addColorStop(offset, color)
      g.fillStyle = gradient
      g.fillRect(0, 0, size, size)
    }, size)
  }

  const glowTexture = radialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.25, 'rgba(255,255,255,.55)'],
    [0.6, 'rgba(255,255,255,.12)'],
    [1, 'rgba(255,255,255,0)'],
  ])

  const shadowTexture = radialTexture([
    [0, 'rgba(0,0,0,.9)'],
    [0.45, 'rgba(0,0,0,.45)'],
    [1, 'rgba(0,0,0,0)'],
  ])

  // A band of light just outside a pocket's collar.
  const ringTexture = radialTexture(
    [
      [0, 'rgba(255,255,255,0)'],
      [0.4, 'rgba(255,255,255,0)'],
      [0.5, 'rgba(255,255,255,.95)'],
      [0.64, 'rgba(255,255,255,.3)'],
      [1, 'rgba(255,255,255,0)'],
    ],
    256,
  )

  // Per-pixel speckle over a base colour, the grain of cloth or leather.
  function speckle(g, width, height, base, spread, random) {
    g.fillStyle = base
    g.fillRect(0, 0, width, height)
    const image = g.getImageData(0, 0, width, height)
    const data = image.data
    for (let i = 0; i < data.length; i += 4) {
      const jitter = 1 + (random() - 0.5) * spread
      data[i] *= jitter
      data[i + 1] *= jitter
      data[i + 2] *= jitter
    }
    g.putImageData(image, 0, 0)
  }

  const random = seeded(7)

  // The cloth: a tight per-pixel nap with a faint small mottle, tiling every two units.
  function clothTextures() {
    const draw = (base) => (g, w, h) => {
      speckle(g, w, h, base, 0.2, random)
      for (let i = 0; i < 1400; i++) {
        const x = random() * w
        const y = random() * h
        const r = 3 + random() * 9
        g.fillStyle = random() < 0.5 ? 'rgba(0,0,0,.045)' : 'rgba(255,255,255,.035)'
        for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
          g.beginPath()
          g.arc(x + dx, y + dy, r, 0, Math.PI * 2)
          g.fill()
        }
      }
    }
    const map = canvasTexture(draw('#0e6038'), 1024, 1024, { repeat: true })
    const bump = canvasTexture(draw('#808080'), 1024, 1024, { colour: false, repeat: true })
    for (const texture of [map, bump]) texture.repeat.set(0.5, 0.5)
    return { map, bump }
  }

  // Mahogany: long grain lines that close on themselves across the width, so the
  // texture tiles along a rail without a seam. One tile covers 4 × 1 units.
  function woodTexture() {
    return canvasTexture(
      (g, w, h) => {
        const gradient = g.createLinearGradient(0, 0, 0, h)
        gradient.addColorStop(0, '#4b1d0c')
        gradient.addColorStop(0.5, '#5a2410')
        gradient.addColorStop(1, '#431a0a')
        g.fillStyle = gradient
        g.fillRect(0, 0, w, h)
        for (let i = 0; i < 240; i++) {
          const y0 = random() * h
          const amp = 1 + random() * 7
          const k = 1 + Math.floor(random() * 3)
          const phase = random() * Math.PI * 2
          const dark = random() < 0.72
          g.strokeStyle = dark ? `rgba(18,5,1,${0.08 + random() * 0.24})` : `rgba(190,96,48,${0.05 + random() * 0.1})`
          g.lineWidth = 0.6 + random() * 2.4
          g.beginPath()
          for (let x = 0; x <= w; x += 8) {
            const a = (x / w) * Math.PI * 2 * k + phase
            const y = y0 + Math.sin(a) * amp + Math.sin(a * 3 + phase) * amp * 0.25
            if (x === 0) g.moveTo(x, y)
            else g.lineTo(x, y)
          }
          g.stroke()
        }
      },
      1024,
      256,
      { repeat: true },
    )
  }

  function leatherBump() {
    const texture = canvasTexture((g, w, h) => speckle(g, w, h, '#808080', 0.9, random), 256, 256, {
      colour: false,
      repeat: true,
    })
    texture.repeat.set(6, 1)
    return texture
  }

  // A pool ball's surface as an equirectangular map: a solid colour, or white with a
  // colour band for a stripe, and the number on a white disc front and back. The
  // front disc sits where a sphere faces +z.
  function ballTexture(number) {
    return canvasTexture(
      (g, w, h) => {
        const colour = theme.ballColour(number)
        const stripe = number > 8
        g.fillStyle = stripe ? '#f3eee2' : colour
        g.fillRect(0, 0, w, h)
        if (stripe) {
          g.fillStyle = colour
          g.fillRect(0, h * 0.27, w, h * 0.46)
        }
        const r = h * 0.15
        for (const u of [0.25, 0.75]) {
          const cx = u * w
          const cy = h / 2
          g.fillStyle = '#f6f2e8'
          g.beginPath()
          g.arc(cx, cy, r, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = '#15110d'
          g.font = theme.labelFont(Math.round(r * (number > 9 ? 1.02 : 1.2)))
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText(String(number), cx, cy + r * 0.06)
          if (number === 6 || number === 9) g.fillRect(cx - r * 0.26, cy + r * 0.58, r * 0.52, r * 0.08)
        }
      },
      1024,
      512,
    )
  }

  // The cue ball carries small red dots, so its roll can be seen.
  function cueTexture() {
    return canvasTexture(
      (g, w, h) => {
        g.fillStyle = '#f7f3ea'
        g.fillRect(0, 0, w, h)
        g.fillStyle = '#c8202c'
        const r = h * 0.035
        for (const u of [0, 0.25, 0.5, 0.75, 1]) {
          g.beginPath()
          g.ellipse(u * w, h / 2, r, r, 0, 0, Math.PI * 2)
          g.fill()
        }
        for (const [u, v] of [[0.125, 0.25], [0.625, 0.25], [0.375, 0.75], [0.875, 0.75]]) {
          g.beginPath()
          g.ellipse(u * w, v * h, r / Math.sin(v * Math.PI), r, 0, 0, Math.PI * 2)
          g.fill()
        }
        g.fillRect(0, 0, w, r * 0.9)
        g.fillRect(0, h - r * 0.9, w, r * 0.9)
      },
      512,
      256,
    )
  }

  // A wisp of chalk dust: soft clumps around the middle with a few loose grains, in
  // white so a sprite can tint it.
  function chalkTexture() {
    return canvasTexture((g, size) => {
      const blob = (x, y, r, alpha) => {
        const gradient = g.createRadialGradient(x, y, 0, x, y, r)
        gradient.addColorStop(0, `rgba(255,255,255,${alpha})`)
        gradient.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = gradient
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
      for (let i = 0; i < 16; i++) {
        const angle = random() * Math.PI * 2
        const reach = random() ** 1.5 * size * 0.24
        blob(size / 2 + Math.cos(angle) * reach, size / 2 + Math.sin(angle) * reach, size * (0.1 + random() * 0.16), 0.16 + random() * 0.16)
      }
      for (let i = 0; i < 70; i++) {
        const angle = random() * Math.PI * 2
        const reach = random() * size * 0.42
        g.fillStyle = `rgba(255,255,255,${0.2 + random() * 0.4})`
        g.fillRect(size / 2 + Math.cos(angle) * reach, size / 2 + Math.sin(angle) * reach, 1.5, 1.5)
      }
    }, 128)
  }

  function glowSprite(color, opacity, width, height = width) {
    const sprite = new T.Sprite(
      new T.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity,
        ...additive,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    sprite.scale.set(width, height, 1)
    return sprite
  }

  // A soft dark patch laid on the cloth under a ball.
  function contactShadow(size, opacity) {
    const mesh = new T.Mesh(
      new T.PlaneGeometry(size, size),
      new T.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity, depthWrite: false }),
    )
    mesh.renderOrder = 5
    return mesh
  }

  return {
    T,
    scene,
    additive,
    canvasTexture,
    radialTexture,
    shadowTexture,
    ringTexture,
    clothTextures,
    woodTexture,
    leatherBump,
    ballTexture,
    cueTexture,
    chalkTexture,
    glowSprite,
    contactShadow,
  }
}
