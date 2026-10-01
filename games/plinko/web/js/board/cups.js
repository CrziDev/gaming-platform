import { theme } from '../theme.js'

import {
  BACK_WASH_OPACITY,
  BAY_PITCH,
  CUP_HEIGHT,
  CUP_INNER_RX,
  CUP_INNER_RZ,
  CUP_RX,
  CUP_RZ,
  CUP_TOP,
  CUP_Z,
  FACE,
  FLOOR,
  FRONT_SHEET_Z,
  HALO_OPACITY,
  HOT_OPACITY,
  MOUTH_COLLAR,
  MOUTH_LIP,
  MOUTH_RX,
  MOUTH_RZ,
  MOUTH_Y,
  MOUTH_Z,
  SLOTS,
  TRAY_FRONT_Z,
  TUBE_TOP,
  cupPoint,
  mouthRoll,
  mouthX,
  slotX,
} from './geometry.js'

const MOUTH_INNER_RX = MOUTH_RX - MOUTH_LIP
const MOUTH_INNER_RZ = MOUTH_RZ - MOUTH_LIP

// Eleven free-standing glowing cups, each with a drop mouth cut into the chute above
// it. Returns one entry per cup: its colour band, the canvas its label is painted on,
// and the materials the landing pulse brightens.
export function buildCups(kit) {
  const { T } = kit
  const parts = {
    body: cupBody(T, CUP_HEIGHT),
    rim: cupRim(T),
    opening: ellipseDisc(T, 64, CUP_INNER_RX * 1.01, CUP_INNER_RZ * 1.01),
    lip: mouthLip(T),
    collar: mouthCollar(T),
    throat: ellipseDisc(T, 128, MOUTH_INNER_RX * 1.005, MOUTH_INNER_RZ * 1.005),
    star: starTexture(kit),
    wash: washTexture(kit),
    pool: kit.radialTexture([
      [0, 'rgba(255,255,255,1)'],
      [0.45, 'rgba(255,255,255,.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  }
  return Array.from({ length: SLOTS }, (_, slot) => buildCup(kit, parts, slot))
}

function buildCup(kit, parts, slot) {
  const { T, scene } = kit
  const band = theme.cupBand(slot, SLOTS)
  const x = slotX(slot)
  const glow = new T.Color(band.glow)

  const label = document.createElement('canvas')
  label.width = 384
  label.height = Math.round((384 * CUP_HEIGHT) / (2 * CUP_RX))
  const labelTexture = new T.CanvasTexture(label)
  labelTexture.colorSpace = T.SRGBColorSpace
  labelTexture.anisotropy = 8

  const pulse = { value: 0 }
  const uniforms = {
    deep: { value: new T.Color(band.deep) },
    base: { value: new T.Color(band.base) },
    hi: { value: new T.Color(band.hi) },
    light: { value: new T.Color(band.light) },
    pulse,
    radii: { value: new T.Vector2(CUP_INNER_RX, CUP_INNER_RZ) },
    depth: { value: CUP_HEIGHT - 0.08 },
    y0: { value: FLOOR },
    y1: { value: CUP_TOP },
    halfWidth: { value: CUP_RX },
    label: { value: labelTexture },
  }

  const body = new T.Mesh(parts.body, new T.ShaderMaterial({ uniforms, vertexShader: BODY.vertex, fragmentShader: BODY.fragment }))
  body.position.set(x, 0, CUP_Z)
  scene.add(body)

  const opening = new T.Mesh(parts.opening, new T.ShaderMaterial({ uniforms, vertexShader: DISC_VERTEX, fragmentShader: OPENING_FRAGMENT }))
  opening.position.set(x, CUP_TOP - 0.002, CUP_Z)
  scene.add(opening)

  const rim = new T.Mesh(parts.rim, new T.ShaderMaterial({ uniforms, vertexShader: DISC_VERTEX, fragmentShader: RIM_FRAGMENT }))
  rim.position.set(x, CUP_TOP, CUP_Z)
  scene.add(rim)

  // White-hot bloom on the back of the lip.
  const hot = kit.glowSprite(new T.Color(band.light).lerp(new T.Color(0xffffff), 0.5), HOT_OPACITY, CUP_RX, 0.14)
  hot.position.set(x, CUP_TOP + 0.02, CUP_Z - CUP_RZ + 0.03)
  hot.renderOrder = 22
  scene.add(hot)

  // Restrained colour spill: a wash on the back wall, a pool on the ledge, a faint
  // reflection in the base front, and a halo in front of the cup.
  const washBottom = CUP_TOP - 0.4
  const washHeight = TUBE_TOP - 0.15 - washBottom
  const wash = new T.Mesh(
    new T.PlaneGeometry(BAY_PITCH - 0.14, washHeight),
    new T.MeshBasicMaterial({
      map: parts.wash,
      color: glow,
      transparent: true,
      opacity: BACK_WASH_OPACITY,
      ...kit.additive,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  wash.position.set(x, washBottom + washHeight / 2, FACE + 0.02)
  wash.renderOrder = 7
  scene.add(wash)

  const ledgeGeometry = new T.PlaneGeometry(CUP_RX * 1.9, TRAY_FRONT_Z - FRONT_SHEET_Z - 0.04)
  ledgeGeometry.rotateX(-Math.PI / 2)
  const pool = new T.Mesh(
    ledgeGeometry,
    new T.MeshBasicMaterial({ map: parts.pool, color: glow, transparent: true, opacity: 0.32, ...kit.additive, depthWrite: false, toneMapped: false }),
  )
  pool.position.set(x, FLOOR + 0.004, (FRONT_SHEET_Z + TRAY_FRONT_Z) / 2)
  pool.renderOrder = 12
  scene.add(pool)

  const reflection = kit.glowSprite(glow, 0.3, CUP_RX * 1.8, 0.4)
  reflection.position.set(x, FLOOR * 0.5, TRAY_FRONT_Z + 0.02)
  reflection.renderOrder = 12
  scene.add(reflection)

  const halo = kit.glowSprite(glow, HALO_OPACITY, BAY_PITCH * 1.3, CUP_HEIGHT * 1.6)
  halo.position.set(x, FLOOR + CUP_HEIGHT * 0.6, CUP_Z + CUP_RZ + 0.06)
  halo.renderOrder = 17
  scene.add(halo)

  const spark = addMouth(kit, parts, slot, glow, pulse)

  return {
    band,
    label: label.getContext('2d'),
    labelTexture,
    pulse,
    wash: wash.material,
    halo: halo.material,
    hot: hot.material,
    spark,
    level: 0,
  }
}

// The drop mouth, centred in its chute and rolled with it: a thin lip, the collar's
// front wall carrying a touch of the bay colour, a dark throat, crisp edges, and a
// small white glint at the back.
function addMouth(kit, parts, slot, glow, pulse) {
  const { T, scene } = kit
  const chute = new T.Group()
  chute.position.set(mouthX(slot), MOUTH_Y, MOUTH_Z)
  chute.rotation.z = mouthRoll(slot)
  scene.add(chute)

  const uniforms = { radii: { value: new T.Vector2(MOUTH_RX, MOUTH_RZ) }, tint: { value: glow }, pulse }
  const additiveShader = (vertexShader, fragmentShader) =>
    new T.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, blending: T.AdditiveBlending, depthWrite: false })

  const lip = new T.Mesh(parts.lip, additiveShader(LIP.vertex, LIP.fragment))
  lip.renderOrder = 19
  chute.add(lip)

  const collar = new T.Mesh(parts.collar, additiveShader(COLLAR.vertex, COLLAR.fragment))
  collar.renderOrder = 19
  chute.add(collar)

  // Transparent keeps the throat out of the transmission pass, so the glass shows no
  // refracted ghost of it.
  const throat = new T.Mesh(
    parts.throat,
    new T.ShaderMaterial({
      uniforms: { radii: { value: new T.Vector2(MOUTH_INNER_RX, MOUTH_INNER_RZ) }, tint: { value: glow } },
      vertexShader: THROAT.vertex,
      fragmentShader: THROAT.fragment,
      transparent: true,
    }),
  )
  throat.position.y = -0.002
  throat.renderOrder = 18
  chute.add(throat)

  const arc = (rx, rz, from, to, steps) =>
    Array.from({ length: steps + 1 }, (_, q) => {
      const a = from + ((to - from) * q) / steps
      return new T.Vector3(rx * Math.cos(a), 0.003, rz * Math.sin(a))
    })
  kit.highlight(arc(MOUTH_RX + 0.004, MOUTH_RZ + 0.004, 0.06, Math.PI - 0.06, 64), 0.008, 0.85, { parent: chute })
  kit.highlight(arc(MOUTH_RX, MOUTH_RZ, Math.PI + 0.12, 2 * Math.PI - 0.12, 64), 0.0035, 0.35, { parent: chute })
  kit.highlight(arc(MOUTH_INNER_RX, MOUTH_INNER_RZ, 0, 2 * Math.PI, 128).slice(0, -1), 0.004, 0.55, { closed: true, parent: chute })

  const spark = new T.Sprite(
    new T.SpriteMaterial({ map: parts.star, color: 0xf4f8ff, transparent: true, opacity: 0.7, ...kit.additive, depthWrite: false, toneMapped: false }),
  )
  spark.scale.set(0.22, 0.22, 1)
  spark.position.set(0, 0.012, -MOUTH_RZ + MOUTH_LIP * 0.5)
  spark.renderOrder = 23
  chute.add(spark)

  const glint = kit.glowSprite(0xe9f1ff, 0.1, 0.4, 0.14)
  glint.position.set(0, 0.02, -MOUTH_RZ)
  glint.renderOrder = 22
  chute.add(glint)

  return spark
}

// A rounded-box section swept up from the floor, so the front reads flat and the
// corners stay soft.
function cupBody(T, height) {
  const bevel = 0.07
  const profile = []
  for (let j = 0; j <= 6; j++) {
    const a = ((j / 6) * Math.PI) / 2
    profile.push([bevel * (1 - Math.sin(a)), FLOOR + bevel * (1 - Math.cos(a)), a])
  }
  for (let j = 1; j <= 8; j++) profile.push([0, FLOOR + bevel + ((height - bevel) * j) / 8, Math.PI / 2])

  const around = 128
  const position = []
  const normal = []
  const index = []
  for (let q = 0; q <= around; q++) {
    const p = cupPoint((q / around) * Math.PI * 2)
    for (const [inset, y, a] of profile) {
      position.push(p.x * (1 - inset / CUP_RX), y, p.z * (1 - inset / CUP_RZ))
      normal.push(p.nx * Math.sin(a), -Math.cos(a), p.nz * Math.sin(a))
    }
    if (q < around) {
      for (let j = 0; j < profile.length - 1; j++) {
        const a = q * profile.length + j
        const b = a + profile.length
        index.push(a, a + 1, b, b, a + 1, b + 1)
      }
    }
  }
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normal, 3))
  geometry.setIndex(index)
  return geometry
}

// The thin moulded lip between the rounded-box outline and the wide oval opening.
function cupRim(T) {
  const outline = new T.Shape()
  for (let q = 0; q < 128; q++) {
    const p = cupPoint((q / 128) * Math.PI * 2)
    if (q === 0) outline.moveTo(p.x, -p.z)
    else outline.lineTo(p.x, -p.z)
  }
  const hole = new T.Path()
  hole.absellipse(0, 0, CUP_INNER_RX, CUP_INNER_RZ, 0, Math.PI * 2, true)
  outline.holes.push(hole)
  const geometry = new T.ShapeGeometry(outline, 64)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function ellipseDisc(T, segments, rx, rz) {
  const geometry = new T.CircleGeometry(1, segments)
  geometry.rotateX(-Math.PI / 2)
  geometry.scale(rx, 1, rz)
  return geometry
}

function mouthLip(T) {
  const outline = new T.Shape()
  outline.absellipse(0, 0, MOUTH_RX, MOUTH_RZ, 0, Math.PI * 2, false)
  const hole = new T.Path()
  hole.absellipse(0, 0, MOUTH_INNER_RX, MOUTH_INNER_RZ, 0, Math.PI * 2, true)
  outline.holes.push(hole)
  const geometry = new T.ShapeGeometry(outline, 128)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function mouthCollar(T) {
  const segments = 128
  const position = []
  const normal = []
  const uv = []
  const index = []
  for (let q = 0; q <= segments; q++) {
    const a = (q / segments) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const nx = c / MOUTH_RX
    const nz = s / MOUTH_RZ
    const length = Math.hypot(nx, nz)
    position.push(MOUTH_RX * c, 0, MOUTH_RZ * s, MOUTH_RX * c, -MOUTH_COLLAR, MOUTH_RZ * s)
    normal.push(nx / length, 0, nz / length, nx / length, 0, nz / length)
    uv.push(q / segments, 0, q / segments, 1)
    if (q < segments) {
      const t = 2 * q
      index.push(t, t + 2, t + 1, t + 1, t + 2, t + 3)
    }
  }
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  geometry.setIndex(index)
  return geometry
}

function starTexture(kit) {
  return kit.canvasTexture((g, size) => {
    const c = size / 2
    const core = g.createRadialGradient(c, c, 0, c, c, c * 0.45)
    core.addColorStop(0, 'rgba(255,255,255,1)')
    core.addColorStop(0.2, 'rgba(215,245,255,.7)')
    core.addColorStop(1, 'rgba(150,215,255,0)')
    g.fillStyle = core
    g.fillRect(0, 0, size, size)

    const ray = (horizontal, length, thickness) => {
      const gradient = horizontal
        ? g.createLinearGradient(c - length, 0, c + length, 0)
        : g.createLinearGradient(0, c - length, 0, c + length)
      gradient.addColorStop(0, 'rgba(170,230,255,0)')
      gradient.addColorStop(0.5, 'rgba(240,252,255,1)')
      gradient.addColorStop(1, 'rgba(170,230,255,0)')
      g.fillStyle = gradient
      if (horizontal) g.fillRect(c - length, c - thickness / 2, 2 * length, thickness)
      else g.fillRect(c - thickness / 2, c - length, thickness, 2 * length)
    }
    ray(true, c * 0.7, 2.5)
    ray(false, c * 0.95, 2.5)
  }, 128)
}

// Brightest just behind the cup rim, gone by the time it reaches the dip in the front
// glass, and faded at both sides.
function washTexture(kit) {
  return kit.canvasTexture(
    (g, width, height) => {
      const rise = g.createLinearGradient(0, height, 0, 0)
      rise.addColorStop(0, 'rgba(255,255,255,1)')
      rise.addColorStop(0.3, 'rgba(255,255,255,.7)')
      rise.addColorStop(0.55, 'rgba(255,255,255,.22)')
      rise.addColorStop(0.8, 'rgba(255,255,255,.04)')
      rise.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = rise
      g.fillRect(0, 0, width, height)

      const sides = g.createLinearGradient(0, 0, width, 0)
      sides.addColorStop(0, 'rgba(0,0,0,.6)')
      sides.addColorStop(0.18, 'rgba(0,0,0,0)')
      sides.addColorStop(0.82, 'rgba(0,0,0,0)')
      sides.addColorStop(1, 'rgba(0,0,0,.6)')
      g.globalCompositeOperation = 'destination-out'
      g.fillStyle = sides
      g.fillRect(0, 0, width, height)
    },
    64,
    128,
  )
}

// Cup body: flat saturated colour, a touch lighter just under the rim, rounded edges
// falling off, and the multiplier label printed on the front.
const BODY = {
  vertex: `
    varying vec3 vLocal;
    varying vec3 vNormal;
    void main() {
      vLocal = position;
      vNormal = normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    }`,
  fragment: `
    uniform vec3 deep, base, hi, light;
    uniform float pulse, y0, y1, halfWidth;
    uniform sampler2D label;
    varying vec3 vLocal;
    varying vec3 vNormal;
    void main() {
      float h = clamp((vLocal.y - y0) / (y1 - y0), 0., 1.);
      vec3 n = normalize(vNormal);
      vec3 col = base;
      col = mix(col, hi, smoothstep(.86, 1., h) * .55);
      col = mix(col, deep, smoothstep(.55, .98, abs(n.x)) * .28);
      col = mix(col, light, smoothstep(0., .9, -n.y) * .12);
      col *= 1. + pulse * .6;
      vec4 printed = texture2D(label, vec2(vLocal.x / (2. * halfWidth) + .5, h));
      col = mix(col, printed.rgb, printed.a * smoothstep(.3, .7, n.z));
      gl_FragColor = vec4(col, 1.);
      #include <colorspace_fragment>
    }`,
}

const DISC_VERTEX = `
  varying vec3 vWorld;
  varying vec2 vFlat;
  void main() {
    vFlat = position.xz;
    vec4 world = modelMatrix * vec4(position, 1.);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`

// The lip: pale and white-hot along the back, body colour across the front, with only
// a thin bright line on the inner edge.
const RIM_FRAGMENT = `
  uniform vec3 base, hi, light;
  uniform float pulse;
  uniform vec2 radii;
  varying vec3 vWorld;
  varying vec2 vFlat;
  void main() {
    float front = clamp(vFlat.y / radii.y * .5 + .5, 0., 1.), e = length(vFlat / radii);
    vec3 back = mix(light, vec3(1.), .5) + vec3(.6) * exp(-pow(vFlat.x / .12, 2.)) * (1. - smoothstep(.1, .45, front));
    vec3 col = mix(back, base * 1.08, smoothstep(.3, .62, front));
    col = mix(col, mix(light, vec3(1.), .6), (1. - smoothstep(1., 1.07, e)) * smoothstep(.35, .8, front));
    col *= 1. + pulse * .45;
    gl_FragColor = vec4(col, 1.);
    #include <colorspace_fragment>
  }`

// The opening traces the view ray down an oval shaft to the far inner wall so the cup
// reads hollow: a short white-hot band under the back lip, then a deep shade.
const OPENING_FRAGMENT = `
  uniform vec2 radii;
  uniform vec3 deep, base, hi, light;
  uniform float pulse, depth;
  varying vec3 vWorld;
  varying vec2 vFlat;
  void main() {
    vec3 d = normalize(vWorld - cameraPosition);
    vec2 o = vFlat / radii, dd = d.xz / radii;
    float a = max(dot(dd, dd), 1e-5), b = dot(o, dd), c = dot(o, o) - 1.;
    float t = (-b + sqrt(max(b * b - a * c, 0.))) / a;
    float down = -d.y * t, hx = o.x + t * dd.x;
    vec3 col = mix(light, vec3(1.), .6) + vec3(.35) * exp(-pow(hx / .3, 2.)) * (1. - smoothstep(0., .08, down));
    col = mix(col, hi, smoothstep(.03, .08, down));
    col = mix(col, base, smoothstep(.08, .13, down));
    col = mix(col, deep * .8, smoothstep(.13, .22, down));
    if (down > depth) col = deep * .35;
    col *= 1. + pulse * .6;
    gl_FragColor = vec4(col, 1.);
    #include <colorspace_fragment>
  }`

// Faint silver glass, a little brighter toward the back, with one soft white glint at
// the back centre.
const LIP = {
  vertex: `
    varying vec2 vFlat;
    void main() {
      vFlat = position.xz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    }`,
  fragment: `
    uniform vec2 radii;
    uniform vec3 tint;
    uniform float pulse;
    varying vec2 vFlat;
    void main() {
      float back = 1. - smoothstep(-.85, .25, vFlat.y / radii.y);
      vec3 c = vec3(.78, .85, .96) * (.05 + back * .18)
        + vec3(1.) * exp(-pow(vFlat.x / .06, 2.)) * back * back * back * .5
        + tint * (.04 + pulse * .1);
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
}

// The collar's front wall: a polished top edge, the bay colour through the glass, and
// a softer lower edge.
const COLLAR = {
  vertex: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.);
      vView = -mv.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mv;
    }`,
  fragment: `
    uniform vec3 tint;
    uniform float pulse;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float v = vUv.y, f = clamp(1. - abs(dot(normalize(vNormal), normalize(vView))), 0., 1.);
      vec3 c = vec3(.82, .88, 1.) * (exp(-v / .14) * .55 + exp(-(1. - v) / .16) * .22 + .025 + f * f * .25);
      c += tint * (.3 + pulse * .4) * (.55 + .45 * sin(3.1416 * v));
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
}

// The throat traces the view ray in the mouth's own frame, so the roll is honoured: a
// silver sliver on the far wall just below the lip, then black.
const THROAT = {
  vertex: `
    varying vec3 vRay;
    varying vec2 vFlat;
    void main() {
      vFlat = position.xz;
      vec4 world = modelMatrix * vec4(position, 1.);
      vRay = transpose(mat3(modelMatrix)) * (world.xyz - cameraPosition);
      gl_Position = projectionMatrix * viewMatrix * world;
    }`,
  fragment: `
    uniform vec2 radii;
    uniform vec3 tint;
    varying vec3 vRay;
    varying vec2 vFlat;
    void main() {
      vec3 d = normalize(vRay);
      vec2 o = vFlat / radii, dd = d.xz / radii;
      float a = max(dot(dd, dd), 1e-5), b = dot(o, dd), c = dot(o, o) - 1.;
      float t = (-b + sqrt(max(b * b - a * c, 0.))) / a;
      vec2 h = o + t * dd;
      float down = -d.y * t;
      float facing = clamp(dot(normalize(h / radii), -normalize(d.xz)), 0., 1.);
      float back = 1. - smoothstep(-.7, .2, h.y);
      vec3 lit = mix(vec3(.2, .22, .26), vec3(.62, .67, .76), back) * exp(-down / .016) + tint * .035 * exp(-down / .06);
      gl_FragColor = vec4(vec3(.002, .003, .005) + lit * (.3 + .7 * facing), 1.);
      #include <colorspace_fragment>
    }`,
}
