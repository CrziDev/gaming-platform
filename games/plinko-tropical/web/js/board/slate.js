import { theme } from '../theme.js'
import {
  BOTTOM,
  BULB_SPACING,
  CHUTE_HALF_WIDTH,
  CHUTE_HEIGHT,
  CHUTE_Z,
  CRADLE_RADIUS,
  CRADLE_Y,
  FOOT_HALF_WIDTH,
  PEG_RADIUS,
  PEG_SPACING,
  RIM_DEPTH,
  RIM_WIDTH,
  ROWS,
  ROW_HEIGHT,
  ROW_TOP,
  SLATE_DEPTH,
  TOP,
  WAIT_RADIUS,
  WAIT_Y,
  loopFromFoot,
  outlinePoints,
  spacedAround,
} from './geometry.js'

// The slate board: a dark face inside a steel and gold rim set with warm lights, mirror
// pegs, and the glass chute standing on the cradle where the ball waits. Returns the
// pegs, the waiting ball, the chrome they share with the falling ball, and the rim's
// finishes, which the tray's dividers reuse.
export function buildSlate(kit, studios) {
  const { T } = kit
  const gold = new T.MeshStandardMaterial({ color: theme.gold, metalness: 1, roughness: 0.2, envMap: studios.warm, envMapIntensity: 1.2 })
  const chrome = new T.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02, envMap: studios.ball, envMapIntensity: 1 })
  const finishes = rimFinishes(kit, studios)
  addBackShadow(kit)
  addFace(kit)
  addRim(kit, finishes)
  addBulbs(kit)
  addChute(kit, gold)
  const pegs = addPegs(kit, chrome)
  const waitingBall = addWaitingBall(kit, chrome)
  return { pegs, waitingBall, chrome, finishes }
}

// The rim from the outside in: a pale gold lip, a channel of blue steel, a thin gold
// bead, a dark groove, and a bronze ledge stepping down to the face. Each layer runs
// round the outline between two offsets and stands `height` off the face. A layer with
// a `round` is drawn that much narrower and bevelled back out to its offsets, so its
// crest is a rounded bead that catches the light.
const RIM_LAYERS = [
  { inner: RIM_WIDTH - 0.055, outer: RIM_WIDTH, height: RIM_DEPTH, finish: 'lip', round: 0.022 },
  { inner: 0.085, outer: RIM_WIDTH - 0.05, height: RIM_DEPTH - 0.035, finish: 'steel', round: 0 },
  { inner: 0.055, outer: 0.09, height: RIM_DEPTH - 0.02, finish: 'lip', round: 0.013 },
  { inner: 0.035, outer: 0.055, height: 0.05, finish: 'groove', round: 0 },
  { inner: -0.03, outer: 0.04, height: 0.085, finish: 'bronze', round: 0.02 },
]

const toVectors = (T, points) => points.map(([x, y]) => new T.Vector2(x, y))

// A soft dark pool behind the board, so it stands off the bright terrace.
function addBackShadow(kit) {
  const { T, scene } = kit
  const shadow = new T.Mesh(
    new T.PlaneGeometry(15, 15),
    new T.MeshBasicMaterial({ map: kit.shadowTexture, transparent: true, opacity: 0.5, depthWrite: false }),
  )
  shadow.position.set(0, TOP * 0.45, -0.8)
  shadow.scale.set(1, 1.05, 1)
  scene.add(shadow)
}

// The face: matte slate lifted a little toward the upper middle, with a fine grain.
function addFace(kit) {
  const { T, scene } = kit
  const geometry = new T.ExtrudeGeometry(new T.Shape(toVectors(T, outlinePoints(0))), { depth: SLATE_DEPTH, bevelEnabled: false })
  geometry.translate(0, 0, -SLATE_DEPTH)
  const position = geometry.attributes.position
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (position.getX(i) + FOOT_HALF_WIDTH) / (2 * FOOT_HALF_WIDTH), (position.getY(i) - BOTTOM) / (TOP - BOTTOM))
  }
  const material = new T.MeshStandardMaterial({ map: slateTexture(kit), roughness: 0.86, metalness: 0.05 })
  scene.add(new T.Mesh(geometry, material))
}

function slateTexture(kit) {
  return kit.canvasTexture((g, size) => {
    const { slate } = theme
    g.fillStyle = slate.base
    g.fillRect(0, 0, size, size)
    const lift = g.createRadialGradient(size * 0.5, size * 0.42, 0, size * 0.5, size * 0.42, size * 0.62)
    lift.addColorStop(0, slate.lift)
    lift.addColorStop(1, slate.clear)
    g.fillStyle = lift
    g.fillRect(0, 0, size, size)
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.09)'
      g.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4)
    }
  }, 1024)
}

function rimFinishes(kit, studios) {
  const { T } = kit
  const steel = steelTexture(kit)
  return {
    lip: new T.MeshStandardMaterial({
      color: theme.lip,
      metalness: 1,
      roughness: 0.16,
      envMap: studios.warm,
      envMapIntensity: 1.5,
      emissive: theme.lip,
      emissiveIntensity: 0.22,
    }),
    steel: new T.MeshStandardMaterial({
      color: theme.steel,
      map: steel,
      metalness: 0.6,
      roughness: 0.34,
      envMap: studios.daylight,
      envMapIntensity: 1,
      emissive: theme.steelTone,
      emissiveMap: steel,
    }),
    groove: new T.MeshStandardMaterial({ color: theme.groove, metalness: 0.3, roughness: 0.8 }),
    bronze: new T.MeshStandardMaterial({ color: theme.bronze, metalness: 1, roughness: 0.26, envMap: studios.warm, envMapIntensity: 1.2 }),
  }
}

function addRim(kit, finishes) {
  const { T, scene } = kit
  for (const { inner, outer, height, finish, round } of RIM_LAYERS) {
    const shape = new T.Shape(toVectors(T, outlinePoints(outer - round)))
    shape.holes.push(new T.Path(toVectors(T, outlinePoints(inner + round))))
    const geometry = new T.ExtrudeGeometry(shape, {
      depth: height - 2 * round,
      bevelEnabled: round > 0,
      bevelThickness: round,
      bevelSize: round,
      bevelSegments: 4,
      curveSegments: 4,
    })
    geometry.translate(0, 0, round)
    scene.add(new T.Mesh(geometry, finishes[finish]))
  }

  kit.highlight(
    outlinePoints(RIM_WIDTH - 0.026).map(([x, y]) => new T.Vector3(x, y, RIM_DEPTH + 0.002)),
    0.011,
    0.7,
    { closed: true, color: 0xfff6e0 },
  )
  kit.highlight(
    outlinePoints(0.072).map(([x, y]) => new T.Vector3(x, y, RIM_DEPTH - 0.018)),
    0.007,
    0.55,
    { closed: true, color: 0xfff3d6 },
  )
  kit.highlight(
    outlinePoints(-0.1).map(([x, y]) => new T.Vector3(x, y, 0.01)),
    0.05,
    0.35,
    { closed: true, color: 0x000000 },
  )
}

// Warm lights set into the steel channel beside its outer lip, paired either side of
// the middle and clear of the cradle. Each throws a halo over the rim and a streak of
// light along the channel.
function addBulbs(kit) {
  const { T, scene } = kit
  const spots = spacedAround(loopFromFoot(RIM_WIDTH - 0.1, 16), BULB_SPACING)
  const z = RIM_DEPTH - 0.035
  const bulbs = new T.InstancedMesh(
    new T.SphereGeometry(0.05, 12, 8),
    new T.MeshBasicMaterial({ color: new T.Color(theme.bulb).multiplyScalar(3), toneMapped: false }),
    spots.length,
  )
  const matrix = new T.Matrix4()
  spots.forEach(({ x, y, angle }, i) => {
    bulbs.setMatrixAt(i, matrix.makeTranslation(x, y, z + 0.01))
    const halo = kit.glowSprite(theme.bulbGlow, 1, 0.84)
    halo.position.set(x, y, z + 0.06)
    halo.renderOrder = 15
    const core = kit.glowSprite(theme.bulb, 1, 0.3)
    core.position.set(x, y, z + 0.07)
    core.renderOrder = 16
    const streak = kit.glowSprite(theme.bulbGlow, 0.6, 1.6, 0.22)
    streak.material.rotation = angle
    streak.position.set(x, y, z + 0.04)
    streak.renderOrder = 14
    scene.add(halo, core, streak)
  })
  scene.add(bulbs)
}

// Brushed blue steel: soft lighter and darker clouds over a fine grain, tiled across the
// channel in scene units so it reads the same on every side.
function steelTexture(kit) {
  const { T } = kit
  const texture = kit.canvasTexture((g, size) => {
    g.fillStyle = '#c4ced8'
    g.fillRect(0, 0, size, size)
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = size * (0.12 + Math.random() * 0.2)
      const light = i % 2 === 0
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          const cloud = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r)
          cloud.addColorStop(0, light ? 'rgba(255,255,255,.4)' : 'rgba(40,60,85,.35)')
          cloud.addColorStop(1, 'rgba(0,0,0,0)')
          g.fillStyle = cloud
          g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r)
        }
      }
    }
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'
      g.fillRect(Math.random() * size, Math.random() * size, 3, 1)
    }
  }, 512)
  texture.wrapS = T.RepeatWrapping
  texture.wrapT = T.RepeatWrapping
  texture.repeat.set(0.4, 0.4)
  return texture
}

// The chute: a dark back wall between gold rails standing on the cradle's mouth, lit
// blue down its middle and brightest where it fills the cradle behind the ball, with a
// glass glint down one side. The wall sits behind the face so it shows only through
// the cradle and above the board.
function addChute(kit, gold) {
  const { T, scene } = kit
  const bottom = CRADLE_Y - CRADLE_RADIUS
  const centreY = bottom + CHUTE_HEIGHT / 2
  const width = 2 * CHUTE_HALF_WIDTH

  const back = new T.Mesh(new T.PlaneGeometry(width, CHUTE_HEIGHT), new T.MeshBasicMaterial({ color: theme.chuteBack }))
  back.position.set(0, centreY, -SLATE_DEPTH - 0.1)
  const core = new T.Mesh(
    new T.PlaneGeometry(width, CHUTE_HEIGHT),
    new T.MeshBasicMaterial({
      map: chuteTexture(kit),
      color: new T.Color(theme.chute).multiplyScalar(1.5),
      transparent: true,
      ...kit.additive,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  core.position.set(0, centreY, -SLATE_DEPTH - 0.06)
  scene.add(back, core)

  const railHeight = bottom + CHUTE_HEIGHT - CRADLE_Y
  for (const side of [-1, 1]) {
    const rail = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, railHeight, 16), gold)
    rail.position.set(side * (CHUTE_HALF_WIDTH + 0.01), CRADLE_Y + railHeight / 2, CHUTE_Z)
    scene.add(rail)
  }
  const glintX = -CHUTE_HALF_WIDTH + 0.1
  kit.highlight(
    [new T.Vector3(glintX, CRADLE_Y + 0.4, CHUTE_Z + 0.02), new T.Vector3(glintX, bottom + CHUTE_HEIGHT, CHUTE_Z + 0.02)],
    0.014,
    0.4,
  )
}

function chuteTexture(kit) {
  return kit.canvasTexture(
    (g, width, height) => {
      const across = g.createLinearGradient(0, 0, width, 0)
      across.addColorStop(0, 'rgba(255,255,255,.18)')
      across.addColorStop(0.3, 'rgba(255,255,255,.35)')
      across.addColorStop(0.5, 'rgba(255,255,255,1)')
      across.addColorStop(0.7, 'rgba(255,255,255,.35)')
      across.addColorStop(1, 'rgba(255,255,255,.18)')
      g.fillStyle = across
      g.fillRect(0, 0, width, height)
      g.globalCompositeOperation = 'destination-in'
      const down = g.createLinearGradient(0, 0, 0, height)
      down.addColorStop(0, 'rgba(0,0,0,.35)')
      down.addColorStop(0.8, 'rgba(0,0,0,.75)')
      down.addColorStop(0.96, 'rgba(0,0,0,1)')
      down.addColorStop(1, 'rgba(0,0,0,.6)')
      g.fillStyle = down
      g.fillRect(0, 0, width, height)
    },
    64,
    512,
  )
}

// Row r holds r + 3 mirror pegs, polished like the ball. Each keeps a hidden warm glow
// that lights when the ball strikes it; the returned map is keyed "row-index".
function addPegs(kit, chrome) {
  const { T, scene } = kit
  const geometry = new T.SphereGeometry(PEG_RADIUS, 32, 20)
  const shadowGeometry = new T.PlaneGeometry(0.44, 0.44)
  const shadowMaterial = new T.MeshBasicMaterial({ map: kit.shadowTexture, transparent: true, opacity: 0.6, depthWrite: false })

  const pegs = new Map()
  for (let row = 0; row < ROWS; row++) {
    const count = row + 3
    for (let index = 0; index < count; index++) {
      const x = (index - (count - 1) / 2) * PEG_SPACING
      const y = ROW_TOP - row * ROW_HEIGHT

      const peg = new T.Mesh(geometry, chrome)
      peg.position.set(x, y, PEG_RADIUS * 0.6)
      scene.add(peg)

      const shadow = new T.Mesh(shadowGeometry, shadowMaterial)
      shadow.position.set(x + 0.05, y - 0.07, 0.004)
      shadow.renderOrder = 5
      scene.add(shadow)

      const glow = kit.glowSprite(0xffd890, 0, 0.75)
      glow.position.copy(peg.position)
      glow.renderOrder = 9
      scene.add(glow)

      pegs.set(`${row}-${index}`, { glow, level: 0, position: peg.position })
    }
  }
  return pegs
}

// The chrome ball resting in the rim's cradle at the foot of the chute, lit blue from
// above.
function addWaitingBall(kit, chrome) {
  const { T, scene } = kit
  const ball = new T.Mesh(new T.SphereGeometry(WAIT_RADIUS, 48, 32), chrome)
  ball.position.set(0, WAIT_Y, CHUTE_Z)
  scene.add(ball)

  const glow = kit.glowSprite(theme.chute, 0.4, 1.3)
  glow.position.set(0, WAIT_Y + 0.25, 0.1)
  glow.renderOrder = 8
  scene.add(glow)

  return ball
}
