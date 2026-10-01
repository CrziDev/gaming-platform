import { state } from './state.js'
import { theme } from './theme.js'
import { ui } from './ui.js'
import { createBackground } from './board/background.js'
import { flightTo, positionAt } from './board/flight.js'
import {
  BALL_RADIUS,
  FOOT_Y,
  HEAD_Y,
  OUTER_HALF_WIDTH,
  PITCH,
  POCKET_Y,
  RAIL_HEIGHT,
  TOP,
  clamp01,
  slotX,
} from './board/geometry.js'
import { createKit } from './board/kit.js'
import { applyPulse, measurePlate, paintPlate } from './board/pockets.js'
import { sharpenShader } from './board/sharpen.js'
import { buildTable } from './board/table.js'
import { createChalk, createTrails } from './board/trail.js'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

// The most device pixels the frame draws: a phone gets its full density, a large
// desktop zone steps down to what still reads sharp.
const PIXEL_BUDGET = 4_500_000

// The 3D table. It draws only what the host tells it: the payouts it is configured
// with, and the slot each round has already settled in.
export const board = {
  T: null,
  host: null,
  kit: null,
  renderer: null,
  scene: null,
  camera: null,
  composer: null,
  sharpen: null,
  background: null,
  upper: null,
  apron: null,
  pegs: null,
  waitingBall: null,
  cueBall: null,
  cueMaterial: null,
  cups: [],
  balls: [],
  trails: null,
  chalk: null,
  ballGeometry: null,
  regrowAt: null,
  frameRequest: 0,
  lastFrame: 0,
  audioCtx: null,
  noise: null,
  onLanded: null,

  init(T, addons, host) {
    this.T = T
    this.host = host
    this.renderer = createRenderer(T, host)
    this.scene = new T.Scene()
    this.scene.environment = hallLighting(T, this.renderer)
    this.camera = new T.PerspectiveCamera(30, 1, 0.1, 200)
    if (addons) {
      this.sharpen = new addons.ShaderPass(sharpenShader(T))
      this.composer = createComposer(T, addons, this.renderer, this.scene, this.camera, this.sharpen)
    }

    const kit = createKit(T, this.scene)
    this.kit = kit
    this.background = createBackground(kit)
    const table = buildTable(kit)
    this.upper = table.upper
    this.apron = table.apron
    this.pegs = table.pegs
    this.waitingBall = table.waitingBall
    this.cueBall = table.cueBall
    this.cueMaterial = table.cueMaterial
    this.cups = table.pockets
    addLights(T, this.scene, this.upper)
    this.trails = createTrails(kit, this.upper, this.camera)
    this.chalk = createChalk(kit, this.upper)
    this.ballGeometry = new T.SphereGeometry(BALL_RADIUS, 48, 32)

    this.scene.updateMatrixWorld(true)
    this.fit()
    new ResizeObserver(() => this.fit()).observe(host)
  },

  // Frames the table inside the host's stage rect. The canvas covers the whole frame
  // so the hall runs behind the host's controls; only the view offset follows the stage.
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
      this.sharpen.uniforms.texel.value.set(1 / (width * this.renderer.getPixelRatio()), 1 / (height * this.renderer.getPixelRatio()))
    }
    this.background.resize(width, height, stage)
    const extremes = boardExtremes(this.T, this.upper, this.apron)
    frameBoard(this.T, this.camera, extremes, stage)
    this.camera.setViewOffset(stage.width, stage.height, -stage.x, -stage.y, width, height)
    ui.placeTaglines(screenBounds(this.camera, boardExtremes(this.T, this.upper, this.apron), width, height), width, state.controls)
    this.wake()
  },

  setLabels() {
    const texts = state.multipliers.map((hundredths) => ui.formatMultiplier(hundredths))
    const measure = this.cups[0].label
    const { width, height } = measure.canvas
    let size = Math.round(height * 0.7)
    const widest = () => Math.max(...texts.map((text) => measurePlate(measure, text, size)))
    while (widest() > width * 0.84 && size > 24) size -= 2
    this.cups.forEach((cup, i) => paintPlate(cup, texts[i], size))
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

    const T = this.T
    ball.mesh = new T.Mesh(this.ballGeometry, this.cueMaterial)
    ball.mesh.castShadow = true
    ball.mesh.quaternion.copy(this.cueBall.quaternion)
    ball.shadow = this.kit.contactShadow(BALL_RADIUS * 3.2, 0.7)
    ball.segments = flightTo(slot)
    ball.index = 0
    ball.startedAt = performance.now()
    this.upper.add(ball.mesh, ball.shadow)
    this.waitingBall.scale.setScalar(0.001)
    this.regrowAt = ball.startedAt + 250
    this.balls.push(ball)
    this.trails.add(ball.segments, slot, ball.startedAt)
    this.stepBall(ball, ball.startedAt)
    this.wake()
  },

  land(ball) {
    const cup = this.cups[ball.slot]
    if (!reducedMotion.matches) cup.level = 1

    const point = this.upper.localToWorld(new this.T.Vector3(slotX(ball.slot), POCKET_Y + 0.85, 0.3)).project(this.camera)
    ui.toast(((point.x + 1) / 2) * this.host.clientWidth, ((1 - point.y) / 2) * this.host.clientHeight, ball.label, ball.multiplier >= 100)
    this.playLanding(ball.multiplier)
    if (this.onLanded) this.onLanded(ball.round_id, ball.slot)
    this.wake()
  },

  // Advances one ball; returns false once it has dropped into its pocket.
  stepBall(ball, now) {
    let segment = ball.segments[ball.index]
    let t = (now - ball.startedAt) / segment.duration
    while (t >= 1) {
      if (segment.peg) this.hitPeg(segment.peg, segment.x1, segment.y1)
      ball.index++
      ball.startedAt += segment.duration
      if (ball.index >= ball.segments.length) {
        this.upper.remove(ball.mesh, ball.shadow)
        this.land(ball)
        return false
      }
      segment = ball.segments[ball.index]
      t = (now - ball.startedAt) / segment.duration
    }

    const [x, y, z] = positionAt(segment, Math.max(0, t))
    const last = ball.mesh.position
    const dx = x - last.x
    const dy = y - last.y
    const travel = Math.hypot(dx, dy)
    if (travel > 1e-5 && ball.index + t > 0) {
      const axis = new this.T.Vector3(-dy / travel, dx / travel, 0)
      ball.mesh.quaternion.premultiply(new this.T.Quaternion().setFromAxisAngle(axis, travel / BALL_RADIUS))
    }
    ball.mesh.position.set(x, y, z)

    const lift = z - BALL_RADIUS
    ball.shadow.position.set(x + 0.015 + lift * 0.1, y - 0.03 - lift * 0.3, 0.004)
    ball.shadow.material.opacity = segment.kind === 'sink' ? 0 : 0.7 * clamp01(1 - lift * 3)
    ball.shadow.scale.setScalar(1 + lift * 2)
    return true
  },

  // The struck ball gives a little along the line of the hit and settles back.
  hitPeg(key, fromX, fromY) {
    const peg = this.pegs.get(key)
    if (peg) {
      peg.level = 1
      peg.dir.set(peg.base.x - fromX, peg.base.y - fromY, 0).normalize()
      this.chalk.burst(peg.base, fromX, fromY)
    }
    this.playTick()
  },

  // Renders on demand: the loop runs while anything is moving or fading and stops once
  // the table is still, so an idle game costs nothing.
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
      peg.level = Math.max(0, peg.level - dt * 4.5)
      peg.glow.material.opacity = peg.level * 0.4
      peg.mesh.position.copy(peg.base).addScaledVector(peg.dir, 0.06 * Math.sin(Math.PI * (1 - peg.level)))
    }
    this.cups.forEach((cup) => {
      if (cup.level <= 0) return
      cup.level = Math.max(0, cup.level - dt * 1.6)
      applyPulse(cup)
    })
    if (this.regrowAt !== null) {
      const t = clamp01((now - this.regrowAt) / 450)
      this.waitingBall.scale.setScalar(Math.max(0.001, t * t * (3 - 2 * t)))
      if (t >= 1) this.regrowAt = null
    }
    this.balls = this.balls.filter((ball) => this.stepBall(ball, now))
    this.trails.update(now)
    this.chalk.update(dt)

    return (
      this.balls.length > 0 ||
      this.trails.alive ||
      this.chalk.alive ||
      this.regrowAt !== null ||
      this.cups.some((cup) => cup.level > 0) ||
      [...this.pegs.values()].some((peg) => peg.level > 0)
    )
  },

  render() {
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  },

  audio() {
    if (!state.sound) return null
    if (!this.audioCtx) this.audioCtx = new AudioContext()
    return this.audioCtx.state === 'suspended' ? null : this.audioCtx
  },

  noiseBuffer(audio) {
    if (!this.noise) {
      const length = Math.floor(audio.sampleRate * 0.4)
      this.noise = audio.createBuffer(1, length, audio.sampleRate)
      const data = this.noise.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    }
    return this.noise
  },

  // A burst of filtered noise: the body of a click or a thud.
  playNoise(audio, type, frequency, q, volume, duration) {
    const source = audio.createBufferSource()
    source.buffer = this.noiseBuffer(audio)
    const filter = audio.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = audio.createGain()
    gain.gain.setValueAtTime(volume, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(audio.destination)
    source.start()
    source.stop(audio.currentTime + duration + 0.02)
  },

  playTone(audio, frequency, duration, volume, type, glideTo) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, audio.currentTime)
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, audio.currentTime + duration)
    gain.gain.setValueAtTime(volume, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration)
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + duration + 0.02)
  },

  // Sound is a garnish; a browser without it still plays the round.
  playTick() {
    try {
      const audio = this.audio()
      if (!audio) return
      this.playNoise(audio, 'bandpass', 2600 + Math.random() * 700, 1.4, 0.22, 0.045)
      this.playTone(audio, 1900 + Math.random() * 500, 0.03, 0.035, 'triangle')
    } catch {}
  },

  playLanding(multiplier) {
    try {
      const audio = this.audio()
      if (!audio) return
      this.playTone(audio, 150, 0.24, 0.14, 'sine', 70)
      this.playNoise(audio, 'lowpass', 420, 0.7, 0.12, 0.18)
      const times = multiplier / 100
      if (times >= 1) setTimeout(() => this.playTone(audio, 660 + times * 40, 0.28, 0.05, 'sine'), 60)
      if (times >= 3) setTimeout(() => this.playTone(audio, 1320, 0.3, 0.04, 'sine'), 150)
    } catch {}
  },
}

function createRenderer(T, host) {
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFSoftShadowMap
  renderer.setClearColor(theme.ground, 1)
  host.appendChild(renderer.domElement)
  return renderer
}

// A dark room with three warm lamp shades hung in a row over the table, for the balls,
// brass, and varnish to reflect.
function hallLighting(T, renderer) {
  const room = new T.Scene()
  room.add(new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.MeshBasicMaterial({ color: 0x140e09, side: T.BackSide })))
  const strip = (width, height, x, y, z, color, intensity) => {
    const mesh = new T.Mesh(
      new T.PlaneGeometry(width, height),
      new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity), side: T.DoubleSide }),
    )
    mesh.position.set(x, y, z)
    mesh.lookAt(0, 0, 0)
    room.add(mesh)
  }
  for (const x of [-9, 0, 9]) strip(7, 2.6, x, 30, 8, 0xfff0d8, 9)
  strip(44, 6, 0, 4, -34, 0x5a3a22, 0.7)
  strip(44, 6, 0, 4, 34, 0x3c2718, 0.9)
  strip(3, 22, 32, 8, 0, 0x6b4a30, 0.6)
  strip(3, 22, -32, 8, 0, 0x6b4a30, 0.6)
  strip(40, 40, 0, -32, 0, 0x0e3a22, 0.5)
  return new T.PMREMGenerator(renderer).fromScene(room, 0.02).texture
}

// One shadowed lamp over the middle of the table, two softer ones either side, a cool
// rim from behind to lift the balls off the cloth.
function addLights(T, scene, upper) {
  const centre = upper.localToWorld(new T.Vector3(0, TOP * 0.42, 0))
  scene.add(new T.HemisphereLight(0x5a4632, 0x080504, 0.6))

  const lamp = new T.SpotLight(0xffe4bd, 3.6, 0, 0.56, 0.8, 0)
  lamp.position.set(0, centre.y + 14, centre.z + 5)
  lamp.target.position.copy(centre)
  lamp.castShadow = true
  lamp.shadow.mapSize.set(2048, 2048)
  lamp.shadow.bias = -0.0004
  lamp.shadow.normalBias = 0.02
  lamp.shadow.camera.near = 6
  lamp.shadow.camera.far = 40
  scene.add(lamp, lamp.target)

  for (const side of [-1, 1]) {
    const shade = new T.SpotLight(0xffe4bd, 1.1, 0, 0.5, 0.85, 0)
    shade.position.set(side * 7, centre.y + 13, centre.z + 4)
    shade.target.position.set(side * 3, centre.y, centre.z)
    scene.add(shade, shade.target)
  }

  const rim = new T.DirectionalLight(0xa9c1ff, 0.6)
  rim.position.set(0, 14, -24)
  scene.add(rim)
}

// A tight bloom for the pocket pulse and the brightest brass, then the sharpen over the
// tone-mapped frame.
function createComposer(T, addons, renderer, scene, camera, sharpen) {
  const composer = new addons.EffectComposer(renderer, new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 }))
  composer.addPass(new addons.RenderPass(scene, camera))
  composer.addPass(new addons.UnrealBloomPass(new T.Vector2(256, 256), 0.22, 0.18, 0.92))
  composer.addPass(new addons.OutputPass())
  composer.addPass(sharpen)
  return composer
}

// Before the host sends a stage, the table sits in a centred column.
function defaultStage(width, height) {
  const stageWidth = Math.min(width, 600, height / 1.06)
  return { x: (width - stageWidth) / 2, y: 0, width: stageWidth, height: stageWidth * 1.06 }
}

// The table's extreme points, left side then right: the head rail's outer corner, the
// foot rail's outer corner, and the apron's bottom corner.
function boardExtremes(T, upper, apron) {
  return [-1, 1].flatMap((side) => [
    upper.localToWorld(new T.Vector3(side * OUTER_HALF_WIDTH, HEAD_Y, RAIL_HEIGHT)),
    upper.localToWorld(new T.Vector3(side * OUTER_HALF_WIDTH, FOOT_Y, RAIL_HEIGHT)),
    new T.Vector3(side * apron.halfWidth, apron.bottom, apron.front),
  ])
}

// The rectangle the framed table covers on screen, in frame pixels, and its half-width
// at a given height: the rails widen toward the eye from the head corner to the foot
// corner, and the apron holds that width below it.
function screenBounds(camera, extremes, width, height) {
  const points = extremes.map((point) => {
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
  const head = points[3]
  const foot = points[4]
  bounds.halfWidthAt = (y) => {
    if (y >= foot.y) return bounds.right - centre
    return head.x - centre + (foot.x - head.x) * clamp01((y - head.y) / (foot.y - head.y))
  }
  return bounds
}

// Moves the camera along its fixed pitch until the table's extreme points fill the stage.
function frameBoard(T, camera, points, stage) {
  camera.clearViewOffset()
  camera.aspect = stage.width / stage.height
  camera.updateProjectionMatrix()

  const halfFov = Math.tan((camera.fov * Math.PI) / 360)
  const target = new T.Vector3(0, 3, 0)
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
