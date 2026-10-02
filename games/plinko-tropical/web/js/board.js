import { state } from './state.js'
import { theme } from './theme.js'
import { ui } from './ui.js'
import { createBackground } from './board/background.js'
import { flightTo, positionAt } from './board/flight.js'
import {
  BALL_RADIUS,
  CHUTE_Z,
  DIVIDER_TOP,
  PITCH,
  RIM_DEPTH,
  RIM_WIDTH,
  TILE_HEIGHT,
  TILE_Z,
  TOP,
  TRAY_FLOOR,
  TRAY_FRONT_Z,
  WAIT_RADIUS,
  WAIT_Y,
  clamp01,
  outlineCorners,
  slotX,
} from './board/geometry.js'
import { createKit } from './board/kit.js'
import { buildSlate } from './board/slate.js'
import { addDaylight, createStudios } from './board/studios.js'
import { SPILL_REST, TILE_GLOW, buildTiles, measureLabel, paintTile } from './board/tiles.js'
import { createSparks, createStreaks } from './board/trail.js'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

// The most device pixels the frame draws: a phone gets its full density, a large
// desktop zone steps down to what still reads sharp.
const PIXEL_BUDGET = 4_500_000

// The 3D board. It draws only what the host tells it: the payouts it is configured
// with, and the slot each round has already settled in.
export const board = {
  T: null,
  host: null,
  renderer: null,
  scene: null,
  camera: null,
  composer: null,
  background: null,
  pegs: null,
  waitingBall: null,
  chrome: null,
  tiles: [],
  balls: [],
  streaks: null,
  sparks: null,
  ballGeometry: null,
  regrowAt: null,
  frameRequest: 0,
  lastFrame: 0,
  audioCtx: null,
  onLanded: null,

  init(T, addons, host) {
    this.T = T
    this.host = host
    this.renderer = createRenderer(T, host)
    this.scene = new T.Scene()
    const studios = createStudios(T, this.renderer)
    this.scene.environment = studios.daylight
    addDaylight(T, this.scene)
    this.camera = new T.PerspectiveCamera(30, 1, 0.1, 200)
    this.composer = addons ? createComposer(T, addons, this.renderer, this.scene, this.camera) : null

    const kit = createKit(T, this.scene)
    this.background = createBackground(kit, () => this.fit())
    const slate = buildSlate(kit, studios)
    this.pegs = slate.pegs
    this.waitingBall = slate.waitingBall
    this.chrome = slate.chrome
    this.tiles = buildTiles(kit, slate.finishes)
    this.streaks = createStreaks(kit, this.camera)
    this.sparks = createSparks(kit)
    this.ballGeometry = new T.SphereGeometry(BALL_RADIUS, 48, 32)

    this.scene.updateMatrixWorld(true)
    this.fit()
    new ResizeObserver(() => this.fit()).observe(host)
  },

  // Frames the board inside the host's stage rect. The canvas covers the whole frame
  // so the terrace runs behind the host's controls; only the view offset follows the stage.
  fit() {
    const width = this.host?.clientWidth ?? 0
    const height = this.host?.clientHeight ?? 0
    if (!this.renderer || !width || !height) return
    const stage = state.stage ?? defaultStage(width, height)

    const ratio = Math.min(window.devicePixelRatio || 1, 3, Math.sqrt(PIXEL_BUDGET / (width * height)))
    this.renderer.setPixelRatio(Math.max(1, ratio))
    this.renderer.setSize(width, height, false)
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio())
      this.composer.setSize(width, height)
    }
    this.background.resize(width, height, stage)
    frameBoard(this.T, this.camera, stage)
    this.camera.setViewOffset(stage.width, stage.height, -stage.x, -stage.y, width, height)
    ui.placeTagline(screenBounds(this.T, this.camera, width, height), state.controls)
    this.wake()
  },

  setLabels() {
    const texts = state.multipliers.map((hundredths) => ui.formatMultiplier(hundredths))
    const measure = this.tiles[0].label
    const width = measure.canvas.width
    let size = Math.round(width * 0.4)
    const widest = () => Math.max(...texts.map((text) => measureLabel(measure, text, size).width))
    while (widest() > width * 0.78 && size > 30) size -= 2
    this.tiles.forEach((tile, i) => paintTile(tile, texts[i], size))
    this.wake()
  },

  dropBall({ round_id, slot, label, multiplier }) {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }

    const ball = { round_id, slot, label, multiplier }
    if (reducedMotion.matches) {
      this.land(ball)
      return
    }

    ball.mesh = new this.T.Mesh(this.ballGeometry, this.chrome)
    ball.segments = flightTo(slot)
    ball.index = 0
    ball.startedAt = performance.now()
    this.scene.add(ball.mesh)
    this.waitingBall.scale.setScalar(0.001)
    this.regrowAt = ball.startedAt + 250
    this.balls.push(ball)
    this.streaks.add(ball.segments, slot, ball.startedAt)
    this.stepBall(ball, ball.startedAt)
    this.wake()
  },

  land(ball) {
    const tile = this.tiles[ball.slot]
    if (!reducedMotion.matches) tile.level = 1

    const point = new this.T.Vector3(slotX(ball.slot), DIVIDER_TOP + 0.5, TILE_Z).project(this.camera)
    ui.toast(((point.x + 1) / 2) * this.host.clientWidth, ((1 - point.y) / 2) * this.host.clientHeight, ball.label, ball.multiplier >= 100)
    this.playLanding(ball.multiplier)
    if (this.onLanded) this.onLanded(ball.round_id, ball.slot)
    this.wake()
  },

  // Advances one ball; returns false once it has landed.
  stepBall(ball, now) {
    let segment = ball.segments[ball.index]
    let t = (now - ball.startedAt) / segment.duration
    while (t >= 1) {
      if (segment.peg) this.hitPeg(segment.peg, segment.x1, segment.y1)
      ball.index++
      ball.startedAt += segment.duration
      if (ball.index >= ball.segments.length) {
        this.scene.remove(ball.mesh)
        this.land(ball)
        return false
      }
      segment = ball.segments[ball.index]
      t = (now - ball.startedAt) / segment.duration
    }

    const [x, y, z] = positionAt(segment, Math.max(0, t))
    ball.mesh.position.set(x, y, z)
    ball.mesh.rotation.z -= (x - (ball.lastX ?? x)) * 3
    ball.mesh.rotation.x += 0.05
    ball.lastX = x
    return true
  },

  hitPeg(key, ballX, ballY) {
    const peg = this.pegs.get(key)
    if (peg) {
      peg.level = 1
      this.sparks.burst(peg.position, ballX, ballY)
    }
    this.playTick()
  },

  // Renders on demand: the loop runs while anything is moving or fading and stops once
  // the board is still, so an idle game costs nothing.
  wake() {
    if (this.frameRequest || !this.renderer) return
    this.lastFrame = performance.now()
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
      this.lastFrame = now
      const busy = this.tick(now, dt)
      this.render()
      this.frameRequest = busy ? requestAnimationFrame(loop) : 0
    }
    this.frameRequest = requestAnimationFrame(loop)
  },

  tick(now, dt) {
    for (const peg of this.pegs.values()) {
      if (peg.level <= 0) continue
      peg.level = Math.max(0, peg.level - dt * 3.2)
      peg.glow.material.opacity = peg.level * 0.9
    }
    for (const tile of this.tiles) {
      if (tile.level <= 0) continue
      tile.level = Math.max(0, tile.level - dt * 1.9)
      applyPulse(tile)
    }
    if (this.regrowAt !== null) {
      const t = clamp01((now - this.regrowAt) / 450)
      this.waitingBall.scale.setScalar(Math.max(0.001, t * t * (3 - 2 * t)))
      if (t >= 1) this.regrowAt = null
    }
    this.balls = this.balls.filter((ball) => this.stepBall(ball, now))
    this.streaks.update(now)
    this.sparks.update(dt)

    return (
      this.balls.length > 0 ||
      this.streaks.alive ||
      this.sparks.alive ||
      this.regrowAt !== null ||
      this.tiles.some((tile) => tile.level > 0) ||
      [...this.pegs.values()].some((peg) => peg.level > 0)
    )
  },

  render() {
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  },

  playTick() {
    this.playTone(1300 + Math.random() * 600, 0.05, 0.03, 'triangle')
  },

  playLanding(multiplier) {
    const times = multiplier / 100
    this.playTone(times >= 1 ? 660 + times * 40 : 330, 0.28, 0.06, 'sine')
    if (times >= 3) setTimeout(() => this.playTone(1320, 0.3, 0.04, 'sine'), 90)
  },

  playTone(frequency, duration, volume, type) {
    if (!state.sound) return
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext()
      const audio = this.audioCtx
      if (audio.state === 'suspended') return

      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(frequency, audio.currentTime)
      gain.gain.setValueAtTime(volume, audio.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration)
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.start()
      osc.stop(audio.currentTime + duration + 0.02)
    } catch {
      // Audio is a garnish; a browser without it still plays the round.
    }
  },
}

// The landing tile brightens, washes its colour up the slate and over the floor, and
// gives a hair under the ball. The wash lies flat on the slate, so none of it tips
// back behind the face.
function applyPulse(tile) {
  const level = tile.level
  tile.material.emissiveIntensity = TILE_GLOW + level * 0.9
  tile.faceMaterial.color.setScalar(1 + level * 0.8)
  tile.wash.material.opacity = level * 0.5
  tile.spill.material.opacity = SPILL_REST + level * 0.6
  tile.group.position.y = TRAY_FLOOR + TILE_HEIGHT / 2 - 0.025 * Math.sin(Math.PI * level)
}

function createRenderer(T, host) {
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.NeutralToneMapping
  renderer.toneMappingExposure = 1
  renderer.setClearColor(theme.ground, 1)
  host.appendChild(renderer.domElement)
  return renderer
}

// Some drivers leave a stray infinite pixel in the half-float scene; the bloom's blur
// would spread it into a glowing square, so the scene is capped before it blooms.
const HIGHLIGHT_CEILING = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(min(texel.rgb, vec3(16.)), texel.a);
    }`,
}

// Only light brighter than white blooms: the bulbs, the lit tiles, the chute, and the
// streak. The terrace photo never reaches the threshold.
function createComposer(T, addons, renderer, scene, camera) {
  const composer = new addons.EffectComposer(renderer, new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 }))
  composer.addPass(new addons.RenderPass(scene, camera))
  composer.addPass(new addons.ShaderPass(HIGHLIGHT_CEILING))
  composer.addPass(new addons.UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.3, 1.05))
  composer.addPass(new addons.OutputPass())
  return composer
}

// Before the host sends a stage, the board sits in a centred column.
function defaultStage(width, height) {
  const stageWidth = Math.min(width, 600, height)
  return { x: (width - stageWidth) / 2, y: 0, width: stageWidth, height: stageWidth }
}

// The board's extreme points: the rim's corners at the neck, the waiting ball's top, the
// rim's foot corners at the front of the tray, and its shoulders.
function boardExtremes(T) {
  const [footLeft, footRight, shoulderRight, neckRight, neckLeft, shoulderLeft] = outlineCorners(RIM_WIDTH)
  return [
    new T.Vector3(neckLeft[0], neckLeft[1], RIM_DEPTH),
    new T.Vector3(neckRight[0], neckRight[1], RIM_DEPTH),
    new T.Vector3(0, WAIT_Y + WAIT_RADIUS, CHUTE_Z),
    new T.Vector3(footLeft[0], footLeft[1], TRAY_FRONT_Z),
    new T.Vector3(footRight[0], footRight[1], TRAY_FRONT_Z),
    new T.Vector3(shoulderLeft[0], shoulderLeft[1], RIM_DEPTH),
    new T.Vector3(shoulderRight[0], shoulderRight[1], RIM_DEPTH),
  ]
}

// The rectangle the framed board covers on screen, in frame pixels, and the board's
// half-width at a given height: the sides run straight from the neck to the shoulders
// and stand upright below them.
function screenBounds(T, camera, width, height) {
  const points = boardExtremes(T).map((point) => {
    point.project(camera)
    return { x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height }
  })
  const bounds = {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  }
  const centre = (bounds.left + bounds.right) / 2
  const neck = points[1]
  const shoulder = points[6]
  bounds.halfWidthAt = (y) => {
    if (y >= shoulder.y) return bounds.right - centre
    return neck.x - centre + (shoulder.x - neck.x) * clamp01((y - neck.y) / (shoulder.y - neck.y))
  }
  return bounds
}

// Moves the camera along its fixed pitch until the board's extreme points fill the stage.
function frameBoard(T, camera, stage) {
  const points = boardExtremes(T)
  camera.clearViewOffset()
  camera.aspect = stage.width / stage.height
  camera.updateProjectionMatrix()

  const halfFov = Math.tan((camera.fov * Math.PI) / 360)
  const target = new T.Vector3(0, TOP / 2, 0)
  const projected = new T.Vector3()
  let distance = 30
  for (let i = 0; i < 30; i++) {
    camera.position.set(0, target.y + distance * Math.sin(PITCH), distance * Math.cos(PITCH))
    camera.lookAt(target)
    camera.updateMatrixWorld()
    let left = 9
    let right = -9
    let bottom = 9
    let top = -9
    for (const point of points) {
      projected.copy(point).project(camera)
      left = Math.min(left, projected.x)
      right = Math.max(right, projected.x)
      bottom = Math.min(bottom, projected.y)
      top = Math.max(top, projected.y)
    }
    target.y += ((bottom + top) / 2) * distance * halfFov * 0.9
    distance *= Math.max((right - left) / 1.96, (top - bottom) / 1.98)
  }
}
