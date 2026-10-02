import { theme } from '../theme.js'
import { flightDuration, pathAt } from './flight.js'
import { BALL_RADIUS, FACE, PEG_RADIUS, SLOTS } from './geometry.js'

// The streak is the flight path itself, sampled backwards from the ball every
// STREAK_STEP ms, so it stays a smooth curve at any frame rate and stretches with speed.
const STREAK_SAMPLES = 30
const STREAK_STEP = 7.5
const STREAK_HALF_WIDTH = BALL_RADIUS * 1.5
const STREAK_HEAT = 1.7

const SPARK_POOL = 48
const SPARK_DRAG = 6
const SPARK_FALL = 4

// `fade` reaches exactly 0 at the tail, and interpolation can carry it a hair below, so
// a fragment clamps it before any pow(): a NaN there would bloom into a black square.
const RIBBON_VERTEX = `
  attribute float edge;
  attribute float fade;
  attribute vec3 tint;
  varying float vEdge;
  varying float vFade;
  varying vec3 vTint;
  void main() {
    vEdge = edge;
    vFade = fade;
    vTint = tint;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }`

// A light streak behind each falling ball: a white-hot core in a soft ice-blue glow
// that takes on the landing cup's colour on the last arc in, and drains into the cup
// after it.
export function createStreaks(kit, upper, camera) {
  const { T, scene } = kit
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    toneMapped: false,
    ...kit.additive,
    uniforms: { heat: { value: STREAK_HEAT } },
    vertexShader: RIBBON_VERTEX,
    fragmentShader: `
      uniform float heat;
      varying float vEdge;
      varying float vFade;
      varying vec3 vTint;
      void main() {
        float core = exp(-12. * vEdge * vEdge);
        float glow = exp(-3.6 * vEdge * vEdge);
        vec3 colour = (vTint * (glow * .55 + core) + core * core * vFade) * heat;
        gl_FragColor = vec4(colour, pow(max(vFade, 0.), 1.4));
        #include <colorspace_fragment>
      }`,
  })
  const ice = new T.Color(theme.trail.streak)
  const lay = ribbonLayer(T)
  const live = []

  return {
    add(segments, slot, launchedAt) {
      const mesh = ribbonMesh(T, STREAK_SAMPLES, material)
      mesh.renderOrder = 12
      scene.add(mesh)
      const samples = Array.from({ length: STREAK_SAMPLES }, () => ({ point: new T.Vector3(), half: 0, fade: 0, tint: new T.Color() }))
      live.push({ mesh, samples, segments, launchedAt, total: flightDuration(segments), band: new T.Color(theme.cupBand(slot, SLOTS).glow) })
    },

    update(now) {
      for (let i = live.length - 1; i >= 0; i--) {
        const streak = live[i]
        const elapsed = now - streak.launchedAt
        if (elapsed - (STREAK_SAMPLES - 1) * STREAK_STEP >= streak.total) {
          scene.remove(streak.mesh)
          streak.mesh.geometry.dispose()
          live.splice(i, 1)
          continue
        }
        streak.samples.forEach((sample, k) => {
          const time = Math.min(streak.total, Math.max(0, elapsed - k * STREAK_STEP))
          const [x, y, z, segment, t] = pathAt(streak.segments, time)
          sample.point.set(x, y, z)
          if (segment.onPane) upper.localToWorld(sample.point)
          sample.fade = 1 - k / (STREAK_SAMPLES - 1)
          sample.half = STREAK_HALF_WIDTH * sample.fade ** 0.7
          sample.tint.copy(ice)
          if (segment.kind === 'arc') sample.tint.lerp(streak.band, t)
          if (segment.kind === 'sink') sample.tint.copy(streak.band)
        })
        lay(streak.mesh, streak.samples, (point, out) => out.subVectors(camera.position, point))
      }
    },

    get alive() {
      return live.length > 0
    },
  }
}

// Motes of light thrown off a struck peg, flying out from the contact point across the
// pane and sliding down it as they fade.
export function createSparks(kit, upper) {
  const { T } = kit
  const pool = Array.from({ length: SPARK_POOL }, () => {
    const sprite = kit.glowSprite(theme.trail.spark, 0, 1)
    sprite.visible = false
    sprite.renderOrder = 11
    upper.add(sprite)
    return { sprite, velocity: new T.Vector2(), age: 0, life: 0, size: 0 }
  })
  let next = 0

  return {
    burst(peg, ballX, ballY) {
      const angle = Math.atan2(ballY - peg.y, ballX - peg.x)
      const contactX = peg.x + Math.cos(angle) * PEG_RADIUS
      const contactY = peg.y + Math.sin(angle) * PEG_RADIUS
      const count = 5 + Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i++) {
        const spark = pool[next]
        next = (next + 1) % SPARK_POOL
        const heading = angle + (Math.random() - 0.5) * 2.4
        const speed = 1.4 + Math.random() * 1.6
        spark.velocity.set(Math.cos(heading) * speed, Math.sin(heading) * speed)
        spark.age = 0
        spark.life = 250 + Math.random() * 150
        spark.size = 0.06 + Math.random() * 0.06
        spark.sprite.position.set(contactX, contactY, FACE + PEG_RADIUS * 1.4)
        spark.sprite.visible = true
      }
    },

    update(dt) {
      const drag = Math.exp(-SPARK_DRAG * dt)
      for (const spark of pool) {
        if (!spark.sprite.visible) continue
        spark.age += dt * 1000
        if (spark.age >= spark.life) {
          spark.sprite.visible = false
          continue
        }
        spark.velocity.multiplyScalar(drag)
        spark.velocity.y -= SPARK_FALL * dt
        spark.sprite.position.x += spark.velocity.x * dt
        spark.sprite.position.y += spark.velocity.y * dt
        const k = spark.age / spark.life
        spark.sprite.material.opacity = 0.95 * (1 - k) ** 1.5
        spark.sprite.scale.setScalar(spark.size * (1 - 0.4 * k))
      }
    },

    get alive() {
      return pool.some((spark) => spark.sprite.visible)
    },
  }
}

// A strip of two vertices per sample: `edge` runs -1 to 1 across it, `fade` 1 at the
// head to 0 at the tail.
function ribbonMesh(T, count, material) {
  const geometry = new T.BufferGeometry()
  const dynamic = (size) => new T.BufferAttribute(new Float32Array(count * 2 * size), size).setUsage(T.DynamicDrawUsage)
  geometry.setAttribute('position', dynamic(3))
  geometry.setAttribute('fade', dynamic(1))
  geometry.setAttribute('tint', dynamic(3))
  geometry.setAttribute('edge', new T.BufferAttribute(Float32Array.from({ length: count * 2 }, (_, i) => (i % 2 ? 1 : -1)), 1))
  const index = []
  for (let i = 0; i < count - 1; i++) {
    const a = 2 * i
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  geometry.setIndex(index)
  const mesh = new T.Mesh(geometry, material)
  mesh.frustumCulled = false
  return mesh
}

// Lays a ribbon along its samples, each pair spread `half` either side across the path
// and square to `facing`. Where samples bunch up at either end of the flight the last
// good direction is kept.
function ribbonLayer(T) {
  const tangent = new T.Vector3()
  const toward = new T.Vector3()
  const side = new T.Vector3()
  const across = new T.Vector3(1, 0, 0)

  return (mesh, samples, facing) => {
    const { position, fade, tint } = mesh.geometry.attributes
    samples.forEach((sample, i) => {
      tangent.subVectors(samples[Math.max(0, i - 1)].point, samples[Math.min(samples.length - 1, i + 1)].point)
      side.crossVectors(tangent, facing(sample.point, toward))
      const length = side.length()
      if (length > 1e-6) across.copy(side).divideScalar(length)
      for (const [vertex, sign] of [[2 * i, -1], [2 * i + 1, 1]]) {
        const { x, y, z } = sample.point
        position.setXYZ(vertex, x + across.x * sign * sample.half, y + across.y * sign * sample.half, z + across.z * sign * sample.half)
        fade.setX(vertex, sample.fade)
        tint.setXYZ(vertex, sample.tint.r, sample.tint.g, sample.tint.b)
      }
    })
    position.needsUpdate = true
    fade.needsUpdate = true
    tint.needsUpdate = true
  }
}
