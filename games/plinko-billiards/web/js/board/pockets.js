import { theme } from '../theme.js'
import {
  APRON_HEIGHT,
  PLATE_HEIGHT,
  PLATE_REST,
  PLATE_WIDTH,
  POCKET_DEPTH,
  POCKET_R,
  POCKET_Y,
  RING_REST,
  SLOTS,
  slotX,
} from './geometry.js'

// Each pocket: a leather cup hanging through the cloth, a leather collar with a brass
// lip, a ring of its band's light on the cloth, and an enamelled plate on the apron
// that carries its payout.
export function addPockets(kit, upper, apron, materials) {
  const { T, scene } = kit
  const profile = [
    [POCKET_R, 0.01],
    [POCKET_R * 0.98, -0.2],
    [POCKET_R * 0.86, -0.42],
    [POCKET_R * 0.55, -POCKET_DEPTH + 0.03],
    [0, -POCKET_DEPTH],
  ].map(([r, z]) => new T.Vector2(r, z))
  const cupGeometry = new T.LatheGeometry(profile, 40)
  cupGeometry.rotateX(Math.PI / 2)
  const collarGeometry = new T.TorusGeometry(POCKET_R + 0.025, 0.055, 14, 56)
  const lipGeometry = new T.TorusGeometry(POCKET_R + 0.025, 0.02, 10, 56)
  const ringGeometry = new T.PlaneGeometry(4 * (POCKET_R + 0.1), 4 * (POCKET_R + 0.1))
  const plateGeometry = new T.PlaneGeometry(PLATE_WIDTH, PLATE_HEIGHT)
  const plateY = apron.top - APRON_HEIGHT * 0.44

  return Array.from({ length: SLOTS }, (_, slot) => {
    const x = slotX(slot)
    const band = theme.cupBand(slot, SLOTS)

    const lining = new T.MeshStandardMaterial({
      color: 0x1a0f09,
      roughness: 0.85,
      side: T.DoubleSide,
      emissive: new T.Color(band.glow),
      emissiveIntensity: 0,
    })
    const cup = new T.Mesh(cupGeometry, lining)
    cup.position.set(x, POCKET_Y, 0)
    upper.add(cup)

    const collar = new T.Mesh(collarGeometry, materials.leather)
    collar.position.set(x, POCKET_Y, 0.03)
    collar.receiveShadow = true
    upper.add(collar)

    const lip = new T.Mesh(lipGeometry, materials.brass)
    lip.position.set(x, POCKET_Y, 0.085)
    upper.add(lip)

    const ring = new T.Mesh(
      ringGeometry,
      new T.MeshBasicMaterial({
        map: kit.ringTexture,
        color: band.glow,
        transparent: true,
        opacity: RING_REST,
        ...kit.additive,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    ring.position.set(x, POCKET_Y, 0.006)
    ring.renderOrder = 6
    upper.add(ring)

    const glow = kit.glowSprite(band.glow, 0, 0.9)
    glow.position.set(x, POCKET_Y, 0.12)
    glow.renderOrder = 12
    upper.add(glow)

    const labelTexture = kit.canvasTexture(() => {}, 512, Math.round((512 * PLATE_HEIGHT) / PLATE_WIDTH))
    const label = labelTexture.image.getContext('2d')
    const plate = new T.Mesh(
      plateGeometry,
      new T.MeshStandardMaterial({
        map: labelTexture,
        emissiveMap: labelTexture,
        emissive: 0xffffff,
        emissiveIntensity: PLATE_REST,
        metalness: 0.35,
        roughness: 0.32,
        transparent: true,
      }),
    )
    plate.position.set(x, plateY, apron.front + 0.012)
    scene.add(plate)

    return { band, label, labelTexture, plate, ring, glow, lining, level: 0 }
  })
}

export function applyPulse(cup) {
  const level = cup.level
  cup.ring.material.opacity = RING_REST + level * 0.75
  cup.glow.material.opacity = level * 0.85
  cup.lining.emissiveIntensity = level * 0.7
  cup.plate.material.emissiveIntensity = PLATE_REST + level * 0.8
}

const SIGN_SCALE = 0.6

// The payout is a large figure with a smaller sign after it, so on a narrow plate the
// figure keeps most of the width.
export function measurePlate(g, text, size) {
  g.font = theme.labelFont(size)
  const number = g.measureText(text.slice(0, -1)).width
  g.font = theme.labelFont(Math.round(size * SIGN_SCALE))
  return number + g.measureText(text.slice(-1)).width
}

// An enamelled plate in a brass bezel, in the pocket's band, with the payout in its ink.
export function paintPlate(cup, text, size) {
  const g = cup.label
  const { width, height } = g.canvas
  const { band } = cup
  g.clearRect(0, 0, width, height)

  const u = width / 320
  const rounded = (x, y, w, h, r) => {
    g.beginPath()
    g.roundRect(x * u, y * u, w * u, h * u, r * u)
  }
  const w = width / u
  const h = height / u
  const bezel = g.createLinearGradient(0, 0, 0, height)
  bezel.addColorStop(0, '#f6dc94')
  bezel.addColorStop(0.35, '#b98a36')
  bezel.addColorStop(0.65, '#e9c878')
  bezel.addColorStop(1, '#7d5a1f')
  rounded(2, 2, w - 4, h - 4, 22)
  g.fillStyle = bezel
  g.fill()

  const enamel = g.createLinearGradient(0, 10 * u, 0, height - 10 * u)
  enamel.addColorStop(0, band.hi)
  enamel.addColorStop(0.45, band.base)
  enamel.addColorStop(1, band.deep)
  rounded(10, 10, w - 20, h - 20, 14)
  g.fillStyle = enamel
  g.fill()
  g.fillStyle = 'rgba(255,255,255,.22)'
  rounded(17, 14, w - 34, (h - 28) * 0.34, 10)
  g.fill()

  const number = text.slice(0, -1)
  const sign = text.slice(-1)
  const start = (width - measurePlate(g, text, size)) / 2
  g.font = theme.labelFont(size)
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  const baseline = height / 2 + g.measureText('0').actualBoundingBoxAscent / 2
  g.shadowColor = `rgba(0,0,0,${band.shade})`
  g.shadowBlur = 6 * u
  g.shadowOffsetY = 2 * u
  g.fillStyle = band.ink
  g.fillText(number, start, baseline)
  const numberWidth = g.measureText(number).width
  g.font = theme.labelFont(Math.round(size * SIGN_SCALE))
  g.fillText(sign, start + numberWidth, baseline)
  g.shadowColor = 'transparent'
  cup.labelTexture.needsUpdate = true
}
