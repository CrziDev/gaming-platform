import { theme } from '../theme.js'
import {
  BOTTOM,
  DIVIDER_TOP,
  DIVIDER_WIDTH,
  SLOTS,
  SLOT_WIDTH,
  TILE_BEVEL,
  TILE_DEPTH,
  TILE_FRONT_Z,
  TILE_HEIGHT,
  TILE_RADIUS,
  TILE_TOP,
  TILE_WIDTH,
  TILE_Z,
  TRAY_FLOOR,
  TRAY_FRONT_Z,
  TRAY_HALF_WIDTH,
  slotX,
} from './geometry.js'

// A resting tile's glow, and the light it spills on the floor before it.
export const TILE_GLOW = 0.32
export const SPILL_REST = 0.3

// The × beside a payout, as a share of the figure's size.
const SIGN_SCALE = 0.6

// A divider is a small rail: a channel of blue steel down its front inside a pale gold
// lip that runs up both sides and round its top. The lip is a slim post with a round
// top, its edges rounded so they catch the light, standing on the floor beside the tiles
// and a little proud of them.
const DIVIDER_ROUND = 0.012
const DIVIDER_CHANNEL = 0.022
const DIVIDER_BACK_Z = TILE_Z - 0.06
const DIVIDER_FRONT_Z = TILE_FRONT_Z + 0.03
const DIVIDER_SHOULDER = DIVIDER_TOP - DIVIDER_WIDTH / 2

// The payout tray along the foot: a dark recess behind eleven square tiles of backlit
// acrylic that stand wall to wall between dividers built like the rails, on a dark
// glossy floor. Each tile's band tints its edge, paints its face, and spills light onto
// the floor before it; the slate above stays dark until the tile is landed in. Returns
// one entry per tile: its band, the canvas its face is painted on, and the parts the
// landing pulse brightens.
export function buildTiles(kit, finishes) {
  const { T } = kit
  addRecess(kit)
  addTrayFrame(kit, finishes)
  const body = tileBody(T)
  const face = new T.PlaneGeometry(TILE_WIDTH - 2 * TILE_BEVEL, TILE_HEIGHT - 2 * TILE_BEVEL)
  return Array.from({ length: SLOTS }, (_, slot) => buildTile(kit, slot, body, face))
}

// A tile's face: backlit acrylic, deeper at the top and brightest where the light rises
// from its foot, under a fine frost, with a dark outer edge and a bright inner one, and
// the payout with its × smaller beside it.
export function paintTile(tile, text, size) {
  const g = tile.label
  const { width, height } = g.canvas
  paintAcrylic(g, tile.band, width, height)
  if (text) paintPayout(g, tile.band, text, size, width, height)
  tile.texture.needsUpdate = true
}

// A payout's figure and its smaller ×, measured together at a label size.
export function measureLabel(g, text, size) {
  const figure = text.replace(/x$/, '')
  const signSize = Math.round(size * SIGN_SCALE)
  const gap = size * 0.05
  g.font = theme.labelFont(size)
  const figureWidth = g.measureText(figure).width
  g.font = theme.labelFont(signSize)
  const signWidth = g.measureText('×').width
  return { figure, figureWidth, signSize, gap, width: figureWidth + gap + signWidth }
}

// Dark behind the tiles, fading up into the slate above them.
function addRecess(kit) {
  const { T, scene } = kit
  const top = DIVIDER_TOP + 0.35
  const fade = kit.canvasTexture(
    (g, width, height) => {
      const gradient = g.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, 'rgba(4,8,14,0)')
      gradient.addColorStop(0.3, 'rgba(4,8,14,.7)')
      gradient.addColorStop(1, 'rgba(4,8,14,.92)')
      g.fillStyle = gradient
      g.fillRect(0, 0, width, height)
    },
    8,
    128,
  )
  const recess = new T.Mesh(
    new T.PlaneGeometry(2 * TRAY_HALF_WIDTH, top - BOTTOM),
    new T.MeshBasicMaterial({ map: fade, transparent: true, depthWrite: false }),
  )
  recess.position.set(0, (top + BOTTOM) / 2, 0.003)
  scene.add(recess)
}

// A divider either side of every tile, the outer two against the rim, on a dark glossy
// floor with a gold bead along its front edge that catches a line of light like the
// rim's lips. The dividers' lip is a touch less polished than the rim's, so the
// overhead light it catches on their round tops does not bloom over the slate.
function addTrayFrame(kit, finishes) {
  const { T, scene } = kit
  const post = postGeometry(T)
  const postLip = finishes.lip.clone()
  postLip.roughness = 0.32
  const channel = new T.ShapeGeometry(roundTopBar(T, DIVIDER_CHANNEL), 12)
  for (let i = 0; i <= SLOTS; i++) {
    const x = slotX(i) - SLOT_WIDTH / 2
    const lip = new T.Mesh(post, postLip)
    const steel = new T.Mesh(channel, finishes.steel)
    lip.position.x = x
    steel.position.set(x, 0, DIVIDER_FRONT_Z + 0.001)
    scene.add(lip, steel)
    kit.highlight(crestPoints(T, x), 0.006, 0.6, { color: 0xfff6e0 })
  }

  const floor = new T.Mesh(
    new T.BoxGeometry(2 * TRAY_HALF_WIDTH, TRAY_FLOOR - BOTTOM, TRAY_FRONT_Z),
    new T.MeshStandardMaterial({ color: 0x0b1420, roughness: 0.32, metalness: 0.5 }),
  )
  floor.position.set(0, (TRAY_FLOOR + BOTTOM) / 2, TRAY_FRONT_Z / 2)
  const bead = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 2 * TRAY_HALF_WIDTH, 12), finishes.lip)
  bead.rotation.z = Math.PI / 2
  bead.position.set(0, TRAY_FLOOR - 0.02, TRAY_FRONT_Z)
  scene.add(floor, bead)
  kit.highlight(
    [
      new T.Vector3(-TRAY_HALF_WIDTH, TRAY_FLOOR - 0.006, TRAY_FRONT_Z + 0.012),
      new T.Vector3(TRAY_HALF_WIDTH, TRAY_FLOOR - 0.006, TRAY_FRONT_Z + 0.012),
    ],
    0.007,
    0.6,
    { color: 0xfff6e0 },
  )
}

// A bar `half` either side of the divider's middle, from the floor up to a round top
// about the divider's shoulder.
function roundTopBar(T, half) {
  const shape = new T.Shape()
  shape.moveTo(-half, TRAY_FLOOR)
  shape.lineTo(half, TRAY_FLOOR)
  shape.lineTo(half, DIVIDER_SHOULDER)
  shape.absarc(0, DIVIDER_SHOULDER, half, 0, Math.PI, false)
  shape.lineTo(-half, TRAY_FLOOR)
  return shape
}

function postGeometry(T) {
  const geometry = new T.ExtrudeGeometry(roundTopBar(T, DIVIDER_WIDTH / 2 - DIVIDER_ROUND), {
    depth: DIVIDER_FRONT_Z - DIVIDER_BACK_Z - 2 * DIVIDER_ROUND,
    bevelEnabled: true,
    bevelThickness: DIVIDER_ROUND,
    bevelSize: DIVIDER_ROUND,
    bevelSegments: 4,
    curveSegments: 12,
  })
  geometry.translate(0, 0, DIVIDER_BACK_Z + DIVIDER_ROUND)
  return geometry
}

// The middle of the lip on the divider's face at x: up one side, over the top, and down
// the other.
function crestPoints(T, x) {
  const half = (DIVIDER_WIDTH / 2 - DIVIDER_ROUND + DIVIDER_CHANNEL) / 2
  const z = DIVIDER_FRONT_Z + 0.002
  const points = [new T.Vector3(x - half, TRAY_FLOOR, z)]
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI - (Math.PI * k) / 12
    points.push(new T.Vector3(x + Math.cos(a) * half, DIVIDER_SHOULDER + Math.sin(a) * half, z))
  }
  points.push(new T.Vector3(x + half, TRAY_FLOOR, z))
  return points
}

// A thin rounded slab with softened edges, centred on its own origin.
function tileBody(T) {
  const w = TILE_WIDTH - 2 * TILE_BEVEL
  const h = TILE_HEIGHT - 2 * TILE_BEVEL
  const r = TILE_RADIUS
  const shape = new T.Shape()
  shape.moveTo(-w / 2 + r, -h / 2)
  shape.lineTo(w / 2 - r, -h / 2)
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  shape.lineTo(w / 2, h / 2 - r)
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  shape.lineTo(-w / 2 + r, h / 2)
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  shape.lineTo(-w / 2, -h / 2 + r)
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  const geometry = new T.ExtrudeGeometry(shape, {
    depth: TILE_DEPTH - 2 * TILE_BEVEL,
    bevelEnabled: true,
    bevelThickness: TILE_BEVEL,
    bevelSize: TILE_BEVEL,
    bevelSegments: 4,
    curveSegments: 6,
  })
  geometry.center()
  return geometry
}

function buildTile(kit, slot, body, face) {
  const { T, scene } = kit
  const band = theme.cupBand(slot, SLOTS)
  const x = slotX(slot)
  const group = new T.Group()
  group.position.set(x, TRAY_FLOOR + TILE_HEIGHT / 2, TILE_Z)
  scene.add(group)

  const material = new T.MeshPhysicalMaterial({
    color: band.deep,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
    emissive: band.base,
    emissiveIntensity: TILE_GLOW,
  })
  group.add(new T.Mesh(body, material))

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const texture = new T.CanvasTexture(canvas)
  texture.colorSpace = T.SRGBColorSpace
  texture.anisotropy = 4
  const faceMaterial = new T.MeshBasicMaterial({ map: texture, transparent: true })
  const front = new T.Mesh(face, faceMaterial)
  front.position.z = TILE_DEPTH / 2 + 0.002
  group.add(front)

  const wash = new T.Mesh(
    new T.PlaneGeometry(1.1, 0.9),
    new T.MeshBasicMaterial({
      map: kit.glowTexture,
      color: band.glow,
      transparent: true,
      opacity: 0,
      ...kit.additive,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  wash.position.set(x, TILE_TOP, 0.006)
  wash.renderOrder = 4
  const spill = kit.glowSprite(band.glow, SPILL_REST, 1.1, 0.4)
  spill.position.set(x, TRAY_FLOOR - 0.03, TRAY_FRONT_Z + 0.02)
  spill.renderOrder = 4
  scene.add(wash, spill)

  const tile = { band, label: canvas.getContext('2d'), texture, group, material, faceMaterial, wash, spill, level: 0 }
  paintTile(tile, '', 0)
  return tile
}

const withAlpha = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`
}

function paintAcrylic(g, band, width, height) {
  const radius = (width * TILE_RADIUS) / (TILE_WIDTH - 2 * TILE_BEVEL)
  g.clearRect(0, 0, width, height)
  g.save()
  g.beginPath()
  g.roundRect(0, 0, width, height, radius)
  g.clip()

  g.fillStyle = band.base
  g.fillRect(0, 0, width, height)
  const shade = g.createLinearGradient(0, 0, 0, height)
  shade.addColorStop(0, withAlpha(band.deep, 0.55))
  shade.addColorStop(0.5, withAlpha(band.deep, 0))
  g.fillStyle = shade
  g.fillRect(0, 0, width, height)
  const rise = g.createRadialGradient(width / 2, height * 1.1, 0, width / 2, height * 1.1, height * 0.85)
  rise.addColorStop(0, withAlpha(band.hi, 1))
  rise.addColorStop(0.5, withAlpha(band.hi, 0.45))
  rise.addColorStop(1, withAlpha(band.hi, 0))
  g.fillStyle = rise
  g.fillRect(0, 0, width, height)
  const core = g.createRadialGradient(width / 2, height, 0, width / 2, height, width * 0.4)
  core.addColorStop(0, 'rgba(255,255,255,.7)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = core
  g.fillRect(0, 0, width, height)
  const sheen = g.createLinearGradient(0, 0, 0, height * 0.3)
  sheen.addColorStop(0, 'rgba(255,255,255,.12)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = sheen
  g.fillRect(0, 0, width, height)
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)'
    g.fillRect(Math.random() * width, Math.random() * height, 1.3, 1.3)
  }

  g.lineWidth = 6
  g.strokeStyle = withAlpha(band.deep, 0.8)
  g.beginPath()
  g.roundRect(0, 0, width, height, radius)
  g.stroke()
  const edge = g.createLinearGradient(0, 0, 0, height)
  edge.addColorStop(0, 'rgba(255,255,255,.3)')
  edge.addColorStop(1, 'rgba(255,255,255,.85)')
  g.lineWidth = 2.5
  g.strokeStyle = edge
  g.beginPath()
  g.roundRect(5, 5, width - 10, height - 10, radius - 5)
  g.stroke()
  g.restore()
}

function paintPayout(g, band, text, size, width, height) {
  const label = measureLabel(g, text, size)
  const left = (width - label.width) / 2
  g.font = theme.labelFont(size)
  const capHeight = g.measureText('0').actualBoundingBoxAscent
  const baseline = height / 2 + capHeight / 2
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.shadowColor = `rgba(0,0,0,${band.shade})`
  g.shadowBlur = 6
  g.shadowOffsetY = 2
  g.fillStyle = band.ink
  g.fillText(label.figure, left, baseline)
  g.font = theme.labelFont(label.signSize)
  const sign = g.measureText('×')
  const signLift = capHeight * 0.42 - (sign.actualBoundingBoxAscent - sign.actualBoundingBoxDescent) / 2
  g.fillText('×', left + label.figureWidth + label.gap, baseline - signLift)
  g.shadowColor = 'transparent'
}
