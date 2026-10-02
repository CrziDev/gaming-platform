import { theme } from '../theme.js'
import { flightDuration, pathAt } from './flight.js'
import { BALL_RADIUS, SLOTS } from './geometry.js'

// Both marks are the flight path itself, sampled backwards from the ball, so they stay
// smooth curves at any frame rate. The smear is the rolling ball's blur; the track is
// the nap it brushes on the cloth, fading where it lies.
const SMEAR_SAMPLES = 12
const SMEAR_STEP = 9
const SMEAR_HALF_WIDTH = BALL_RADIUS * 0.85
const SMEAR_OPACITY = 0.5

const TRACK_SAMPLES = 40
const TRACK_STEP = 22
const TRACK_HALF_WIDTH = BALL_RADIUS * 0.75
const TRACK_Z = 0.002
const TRACK_LIFT_CUTOFF = 7

const CHALK_POOL = 48
const CHALK_DRAG = 3.5
const CHALK_RISE = 0.18
const CHALK_OPACITY = 0.3

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

// The marks a rolling cue ball leaves: an ivory smear behind it that takes on the
// landing pocket's colour on the last roll in, and a brushed track on the cloth.
export function createTrails(kit, upper, camera) {
  const { T } = kit
  const smearMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    vertexShader: RIBBON_VERTEX,
    fragmentShader: `
      varying float vEdge;
      varying float vFade;
      varying vec3 vTint;
      void main() {
        float core = exp(-2.6 * vEdge * vEdge);
        gl_FragColor = vec4(vTint, ${SMEAR_OPACITY.toFixed(3)} * core * pow(max(vFade, 0.), 1.2));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const light = new T.Color(theme.trail.napLight)
  const dark = new T.Color(theme.trail.napDark)
  // A lighter centre where the nap is pushed flat, and a darker line along each side
  // where it is pushed up.
  const trackMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    vertexShader: RIBBON_VERTEX,
    fragmentShader: `
      varying float vEdge;
      varying float vFade;
      void main() {
        float centre = exp(-2.4 * vEdge * vEdge);
        float side = abs(vEdge) - .8;
        float rim = exp(-18. * side * side);
        vec3 colour = mix(vec3(${rgb(dark)}), vec3(${rgb(light)}), centre / (centre + rim + 1e-4));
        gl_FragColor = vec4(colour, (centre * .1 + rim * .06) * vFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const ivory = new T.Color(theme.trail.smear)
  const lay = ribbonLayer(T)
  const eye = new T.Vector3()
  const outOfCloth = new T.Vector3(0, 0, 1)
  const live = []

  return {
    add(segments, slot, launchedAt) {
      const smear = ribbonMesh(T, SMEAR_SAMPLES, smearMaterial)
      smear.renderOrder = 7
      const track = ribbonMesh(T, TRACK_SAMPLES, trackMaterial)
      track.renderOrder = 4
      upper.add(smear, track)
      const samples = (count) => Array.from({ length: count }, () => ({ point: new T.Vector3(), half: 0, fade: 0, tint: new T.Color() }))
      live.push({
        smear,
        track,
        smearSamples: samples(SMEAR_SAMPLES),
        trackSamples: samples(TRACK_SAMPLES),
        segments,
        launchedAt,
        total: flightDuration(segments),
        band: new T.Color(theme.cupBand(slot, SLOTS).glow),
      })
    },

    update(now) {
      upper.worldToLocal(eye.copy(camera.position))
      for (let i = live.length - 1; i >= 0; i--) {
        const trail = live[i]
        const elapsed = now - trail.launchedAt
        if (elapsed - (TRACK_SAMPLES - 1) * TRACK_STEP >= trail.total) {
          upper.remove(trail.smear, trail.track)
          trail.smear.geometry.dispose()
          trail.track.geometry.dispose()
          live.splice(i, 1)
          continue
        }

        trail.smear.visible = elapsed - (SMEAR_SAMPLES - 1) * SMEAR_STEP < trail.total
        if (trail.smear.visible) {
          trail.smearSamples.forEach((sample, k) => {
            const [segment, t] = sampleAt(trail, sample, elapsed - k * SMEAR_STEP)
            sample.fade = 1 - k / (SMEAR_SAMPLES - 1)
            sample.half = SMEAR_HALF_WIDTH * sample.fade ** 0.6
            sample.tint.copy(ivory)
            if (segment.kind === 'arc') sample.tint.lerp(trail.band, t)
            if (segment.kind === 'sink') sample.tint.copy(trail.band)
          })
          lay(trail.smear, trail.smearSamples, (point, out) => out.subVectors(eye, point))
        }

        // The track marks only where the ball touches the cloth: not mid-hop, and not
        // once it drops into the pocket.
        trail.trackSamples.forEach((sample, k) => {
          const [segment] = sampleAt(trail, sample, elapsed - k * TRACK_STEP)
          const lift = sample.point.z - BALL_RADIUS
          const contact = segment.kind === 'sink' ? 0 : Math.max(0, 1 - lift * TRACK_LIFT_CUTOFF)
          sample.point.z = TRACK_Z
          sample.fade = (1 - k / (TRACK_SAMPLES - 1)) * contact
          sample.half = TRACK_HALF_WIDTH
        })
        lay(trail.track, trail.trackSamples, (point, out) => out.copy(outOfCloth))
      }
    },

    get alive() {
      return live.length > 0
    },
  }
}

// A puff of blue cue chalk knocked off at each strike: dust that sprays sideways from
// the point where the balls touch, leaning back toward the cue ball, lifts off the
// cloth, and thins out of sight.
export function createChalk(kit, upper) {
  const { T } = kit
  const map = kit.chalkTexture()
  const pool = Array.from({ length: CHALK_POOL }, () => {
    const sprite = new T.Sprite(new T.SpriteMaterial({ map, color: theme.trail.chalk, transparent: true, opacity: 0, depthWrite: false }))
    sprite.visible = false
    sprite.renderOrder = 8
    upper.add(sprite)
    return { sprite, velocity: new T.Vector3(), age: 0, life: 0, size: 0 }
  })
  let next = 0

  return {
    burst(struck, ballX, ballY) {
      const angle = Math.atan2(ballY - struck.y, ballX - struck.x)
      const contactX = struck.x + Math.cos(angle) * BALL_RADIUS
      const contactY = struck.y + Math.sin(angle) * BALL_RADIUS
      const count = 5 + Math.floor(Math.random() * 4)
      for (let i = 0; i < count; i++) {
        const puff = pool[next]
        next = (next + 1) % CHALK_POOL
        const heading = angle + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 - Math.random() * 0.9)
        const speed = 0.45 + Math.random() * 0.5
        puff.velocity.set(Math.cos(heading) * speed, Math.sin(heading) * speed, CHALK_RISE * (0.5 + Math.random()))
        puff.age = 0
        puff.life = 600 + Math.random() * 300
        puff.size = 0.3 + Math.random() * 0.16
        puff.sprite.material.rotation = Math.random() * Math.PI * 2
        puff.sprite.position.set(contactX, contactY, BALL_RADIUS * (0.6 + Math.random() * 0.5))
        puff.sprite.visible = true
      }
    },

    update(dt) {
      const drag = Math.exp(-CHALK_DRAG * dt)
      for (const puff of pool) {
        if (!puff.sprite.visible) continue
        puff.age += dt * 1000
        if (puff.age >= puff.life) {
          puff.sprite.visible = false
          continue
        }
        puff.velocity.multiplyScalar(drag)
        puff.sprite.position.addScaledVector(puff.velocity, dt)
        const k = puff.age / puff.life
        puff.sprite.material.opacity = CHALK_OPACITY * Math.min(1, k * 8) * (1 - k) ** 1.5
        puff.sprite.scale.setScalar(puff.size * (0.25 + 0.75 * (1 - (1 - k) ** 3)))
      }
    },

    get alive() {
      return pool.some((puff) => puff.sprite.visible)
    },
  }
}

// Places a sample on the flight `time` ms after the drop, held at either end, and
// returns the segment it fell in and the fraction through it.
function sampleAt(trail, sample, time) {
  const [x, y, z, segment, t] = pathAt(trail.segments, Math.min(trail.total, Math.max(0, time)))
  sample.point.set(x, y, z)
  return [segment, t]
}

const rgb = (colour) => [colour.r, colour.g, colour.b].map((value) => value.toFixed(4)).join(', ')

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
