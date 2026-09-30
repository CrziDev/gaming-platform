import { state } from './state.js'
import { theme } from './theme.js'
import { ui } from './ui.js'
import { createBackground } from './board/background.js'
import { buildCups } from './board/cups.js'
import { buildFins } from './board/fins.js'
import { flightTo, positionAt } from './board/flight.js'
import {
  BACK_WASH_OPACITY,
  BALL_RADIUS,
  CUP_Z,
  FACE,
  FIN_FRONT_Z,
  FIN_HEIGHT,
  FOOT_HALF_WIDTH,
  HALO_OPACITY,
  HOT_OPACITY,
  PANE_TOP_HALF_WIDTH,
  PITCH,
  SLOTS,
  TOP,
  TRAY_FRONT_Z,
  clamp01,
  sideX,
  slotX,
} from './board/geometry.js'
import { createKit } from './board/kit.js'
import { buildPane } from './board/pane.js'
import { buildTray } from './board/tray.js'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

// The 3D board. It draws only what the host tells it: the payouts it is configured
// with, and the slot each round has already settled in.
export const board = {
  T: null,
  renderer: null,
  scene: null,
  camera: null,
  composer: null,
  background: null,
  upper: null,
  pegs: null,
  waitingBall: null,
  chrome: null,
  cups: [],
  pulses: null,
  balls: [],
  ballGeometry: null,
  regrowAt: null,
  frameRequest: 0,
  lastFrame: 0,
  audioCtx: null,
  onLanded: null,

  init(T, addons, host) {
    this.T = T
    this.renderer = createRenderer(T, host)
    this.scene = new T.Scene()
    this.scene.environment = studioLighting(T, this.renderer)
    this.scene.add(new T.AmbientLight(0xffffff, 0.3))
    const key = new T.DirectionalLight(0xffffff, 1.2)
    key.position.set(-6, 14, 12)
    this.scene.add(key)
    this.camera = new T.PerspectiveCamera(30, 1, 0.1, 200)
    this.composer = addons ? createComposer(T, addons, this.renderer, this.scene, this.camera) : null

    const kit = createKit(T, this.scene)
    this.background = createBackground(kit, 'img/city.jpg', () => this.wake())
    this.pulses = { value: new Array(SLOTS).fill(0) }
    const pane = buildPane(kit)
    this.upper = pane.upper
    this.pegs = pane.pegs
    this.waitingBall = pane.waitingBall
    this.chrome = pane.chrome
    buildTray(kit, this.background, this.pulses)
    buildFins(kit)
    this.cups = buildCups(kit)
    this.ballGeometry = new T.SphereGeometry(BALL_RADIUS, 48, 32)

    this.scene.updateMatrixWorld(true)
    this.fit()
    window.addEventListener('resize', () => this.fit())
  },

  // Frames the board inside the host's stage rect. The canvas covers the whole frame
  // so the city runs behind the host's controls; only the view offset follows the stage.
  fit() {
    const width = window.innerWidth
    const height = window.innerHeight
    if (!this.renderer || !width || !height) return
    const stage = state.stage ?? defaultStage(width, height)

    this.renderer.setSize(width, height, false)
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio())
      this.composer.setSize(width, height)
    }
    this.background.resize(width, height, stage)
    frameBoard(this.T, this.camera, this.upper, stage)
    this.camera.setViewOffset(stage.width, stage.height, -stage.x, -stage.y, width, height)
    ui.placeTaglines(screenBounds(this.T, this.camera, this.upper, width, height), width, state.controls)
    this.wake()
  },

  setLabels() {
    const texts = state.multipliers.map((hundredths) => ui.formatMultiplier(hundredths))
    const measure = this.cups[0].label
    const width = measure.canvas.width
    let size = Math.round(width * 0.46)
    const widest = () => {
      measure.font = theme.labelFont(size)
      return Math.max(...texts.map((text) => measure.measureText(text).width))
    }
    while (widest() > width * 0.8 && size > 30) size -= 2
    this.cups.forEach((cup, i) => paintLabel(cup, texts[i], size))
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
    ball.segments = flightTo(slot, this.upper, this.T)
    ball.index = 0
    ball.startedAt = performance.now()
    this.scene.add(ball.mesh)
    this.waitingBall.scale.setScalar(0.001)
    this.regrowAt = ball.startedAt + 250
    this.balls.push(ball)
    this.stepBall(ball, ball.startedAt)
    this.wake()
  },

  land(ball) {
    const cup = this.cups[ball.slot]
    if (!reducedMotion.matches) cup.level = 1

    const point = new this.T.Vector3(slotX(ball.slot), FIN_HEIGHT + 0.55, CUP_Z).project(this.camera)
    ui.toast(((point.x + 1) / 2) * window.innerWidth, ((1 - point.y) / 2) * window.innerHeight, ball.label, ball.multiplier >= 100)
    this.playLanding(ball.multiplier)
    if (this.onLanded) this.onLanded(ball.round_id, ball.slot)
    this.wake()
  },

  // Advances one ball; returns false once it has landed.
  stepBall(ball, now) {
    let segment = ball.segments[ball.index]
    let t = (now - ball.startedAt) / segment.duration
    while (t >= 1) {
      if (segment.peg) this.hitPeg(segment.peg)
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
    const position = ball.mesh.position.set(x, y, z)
    if (segment.onPane) this.upper.localToWorld(position)
    ball.mesh.rotation.z -= (x - (ball.lastX ?? x)) * 3
    ball.mesh.rotation.x += 0.05
    ball.lastX = x
    return true
  },

  hitPeg(key) {
    const peg = this.pegs.get(key)
    if (peg) peg.level = 1
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
      peg.glow.material.opacity = peg.level
    }
    this.cups.forEach((cup, slot) => {
      if (cup.level <= 0) return
      cup.level = Math.max(0, cup.level - dt * 1.8)
      this.applyPulse(cup, slot)
    })
    if (this.regrowAt !== null) {
      const t = clamp01((now - this.regrowAt) / 450)
      this.waitingBall.scale.setScalar(Math.max(0.001, t * t * (3 - 2 * t)))
      if (t >= 1) this.regrowAt = null
    }
    this.balls = this.balls.filter((ball) => this.stepBall(ball, now))

    return (
      this.balls.length > 0 ||
      this.regrowAt !== null ||
      this.cups.some((cup) => cup.level > 0) ||
      [...this.pegs.values()].some((peg) => peg.level > 0)
    )
  },

  applyPulse(cup, slot) {
    const level = cup.level
    cup.pulse.value = level
    cup.wash.opacity = BACK_WASH_OPACITY + level * 0.4
    cup.halo.opacity = HALO_OPACITY + level * 0.25
    cup.hot.opacity = HOT_OPACITY + level * 0.4
    cup.spark.scale.setScalar(0.22 + level * 0.4)
    this.pulses.value[slot] = level
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

function createRenderer(T, host) {
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.NeutralToneMapping
  renderer.toneMappingExposure = 1
  renderer.setClearColor(theme.ground, 1)
  host.appendChild(renderer.domElement)
  return renderer
}

// A soft studio of light strips for the glass and chrome to reflect.
function studioLighting(T, renderer) {
  const studio = new T.Scene()
  studio.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ color: 0x242a34, side: T.BackSide })))
  const strip = (width, height, x, y, z, color, intensity) => {
    const mesh = new T.Mesh(
      new T.PlaneGeometry(width, height),
      new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity), side: T.DoubleSide }),
    )
    mesh.position.set(x, y, z)
    mesh.lookAt(0, 0, 0)
    studio.add(mesh)
  }
  strip(36, 2.5, 0, 32, 8, 0xffffff, 7)
  strip(9, 9, -22, 18, 20, 0xffffff, 5)
  strip(2.2, 22, 26, 6, 14, 0xd6e6ff, 3.5)
  strip(2, 18, -28, 0, -6, 0xffffff, 2.5)
  strip(26, 2, 0, 40, -10, 0xffffff, 8)
  strip(2, 26, 30, 10, -8, 0xffffff, 4)
  strip(44, 5, 0, -6, -32, 0xffb070, 1.6)
  strip(40, 3, 0, -14, 30, 0x5d86ff, 0.6)
  return new T.PMREMGenerator(renderer).fromScene(studio, 0.02).texture
}

function createComposer(T, addons, renderer, scene, camera) {
  const composer = new addons.EffectComposer(renderer, new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 }))
  composer.addPass(new addons.RenderPass(scene, camera))
  composer.addPass(new addons.UnrealBloomPass(new T.Vector2(256, 256), 0.3, 0.24, 0.9))
  composer.addPass(new addons.OutputPass())
  return composer
}

// Before the host sends a stage, the board sits in a centred column.
function defaultStage(width, height) {
  const stageWidth = Math.min(width, 600, height / 1.06)
  return { x: (width - stageWidth) / 2, y: 0, width: stageWidth, height: stageWidth * 1.06 }
}

// The board's extreme points: the pane's top corners and notch, the tray's front
// corners, and its waist.
function boardExtremes(T, upper) {
  return [
    upper.localToWorld(new T.Vector3(-PANE_TOP_HALF_WIDTH, TOP, FACE)),
    upper.localToWorld(new T.Vector3(PANE_TOP_HALF_WIDTH, TOP, FACE)),
    upper.localToWorld(new T.Vector3(0, TOP + 0.45, FACE)),
    new T.Vector3(-FOOT_HALF_WIDTH, 0, TRAY_FRONT_Z),
    new T.Vector3(FOOT_HALF_WIDTH, 0, TRAY_FRONT_Z),
    new T.Vector3(-sideX(1.3, FIN_FRONT_Z), 1.3, FIN_FRONT_Z),
    new T.Vector3(sideX(1.3, FIN_FRONT_Z), 1.3, FIN_FRONT_Z),
  ]
}

// The rectangle the framed board covers on screen, in frame pixels, and the board's
// half-width at a given height. Between the pane's top corner and the tray's waist the
// side flares outward, so the straight line joining them never falls inside the glass.
function screenBounds(T, camera, upper, width, height) {
  const points = boardExtremes(T, upper).map((point) => {
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
  const corner = points[1]
  const waist = points[6]
  bounds.halfWidthAt = (y) => {
    if (y >= waist.y) return bounds.right - centre
    return corner.x - centre + (waist.x - corner.x) * clamp01((y - corner.y) / (waist.y - corner.y))
  }
  return bounds
}

// Moves the camera along its fixed pitch until the board's extreme points fill the stage.
function frameBoard(T, camera, upper, stage) {
  const points = boardExtremes(T, upper)
  camera.clearViewOffset()
  camera.aspect = stage.width / stage.height
  camera.updateProjectionMatrix()

  const halfFov = Math.tan((camera.fov * Math.PI) / 360)
  const target = new T.Vector3(0, 5, 0)
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

function paintLabel(cup, text, size) {
  const g = cup.label
  const { width, height } = g.canvas
  g.clearRect(0, 0, width, height)
  g.font = theme.labelFont(size)
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  const capHeight = g.measureText('0').actualBoundingBoxAscent
  g.shadowColor = `rgba(0,0,0,${cup.band.shade})`
  g.shadowBlur = 8
  g.shadowOffsetY = 2
  g.fillStyle = cup.band.ink
  g.fillText(text, width / 2, height * 0.47 + capHeight / 2)
  cup.labelTexture.needsUpdate = true
}
