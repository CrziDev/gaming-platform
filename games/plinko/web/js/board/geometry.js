// Dimensions of the glass board, in scene units: y is up and z points at the camera.
// The platform plays one board, ten rows of pegs over eleven cups.

export const ROWS = 10
export const SLOTS = ROWS + 1

// Peg field on the leaning pane.
export const PEG_SPACING = 0.74
export const ROW_HEIGHT = 0.74
export const ROW_BOTTOM = 3.1
export const ROW_TOP = ROW_BOTTOM + (ROWS - 1) * ROW_HEIGHT
export const TOP = ROW_TOP + 1.45
export const PEG_RADIUS = 0.11
export const BALL_RADIUS = 0.135
export const NOTCH_RADIUS = 0.4
export const NOTCH_Y = TOP - 0.2

// The acrylic pane: its depth and bevel, and where it bends back from upright.
export const PANE_DEPTH = 0.26
export const BEVEL = 0.04
export const FACE = PANE_DEPTH + BEVEL
export const TILT = 0.5
export const BEND_Y = 2.0
export const BEND_LENGTH = 0.6
export const BEND_RADIUS = BEND_LENGTH / TILT
export const PITCH = 0.42

// The payout tray in front of the pane.
export const TRAY_DEPTH = 1.0
export const FLOOR = 0.5
export const TUBE_TOP = FLOOR + 1.92
export const FIN_RADIUS = 0.2
export const FIN_HEIGHT = TUBE_TOP + 0.5
export const JOIN_Y = FIN_HEIGHT + 0.35
export const FRONT_SHEET_Z = FACE + TRAY_DEPTH - 0.02
export const FIN_FRONT_Z = FRONT_SHEET_Z + 0.05
export const TRAY_FRONT_Z = FIN_FRONT_Z + 0.16

// Cups: a rounded box (a superellipse of CUP_ROUNDNESS) filled to CUP_TOP.
export const CUP_RX = 0.39
export const CUP_RZ = 0.3
export const CUP_ROUNDNESS = 8
export const CUP_TOP = FLOOR + 1.0
export const CUP_HEIGHT = CUP_TOP - FLOOR
export const CUP_INNER_RX = CUP_RX - 0.012
export const CUP_INNER_RZ = CUP_RZ - 0.02
export const CUP_Z = (FACE + FRONT_SHEET_Z) / 2

// Drop mouths: an elliptical opening cut into the top of each chute. The front of the
// collar sits just behind the front sheet; SADDLE_Y is where that sheet meets the walls.
export const MOUTH_RX = 0.28
export const MOUTH_RZ = 0.22
export const MOUTH_LIP = 0.036
export const MOUTH_COLLAR = 0.08
export const MOUTH_Y = TUBE_TOP + 0.05
export const MOUTH_Z = FRONT_SHEET_Z - MOUTH_RZ - 0.035
export const SADDLE_Y = TUBE_TOP + 0.26
export const MOUTH_ROLL = 0.5

// Resting opacities of the colour spill around each cup.
export const BACK_WASH_OPACITY = 0.6
export const HALO_OPACITY = 0.06
export const HOT_OPACITY = 0.8
export const GLASS_TINT_OPACITY = 0.14

// Bays: the tray's half-width and the pitch between cups.
export const BAY_HALF_WIDTH = 4.95
export const BAY_PITCH = (2 * BAY_HALF_WIDTH) / SLOTS

// Fins are wide at the base and taper on gently curved edges to a round tip; each pair
// is the [base, tip] half-width of an inner fin or an outer wall.
export const FIN_RISE = 0.45
export const FIN_TOP = FIN_HEIGHT + FIN_RISE
export const INNER_FIN = [0.05, 0.028]
export const OUTER_FIN = [0.05, 0.028]
export const FIN_BACK_Z = TRAY_FRONT_Z - 0.03
export const FILLET_RADIUS = 0.1

// Fan rake: fin tops lean toward the centre, more the further out a fin stands, which
// beats the camera's downward look splaying verticals outward toward the edges.
export const LEAN = 0.36
export const LEAN_POWER = 1.5
export const LEAN_BASE = 0.13

// The framed camera position. The side outline is drawn as this eye sees it.
export const EYE_Y = 14.79
export const EYE_Z = 20.09
export const CORNER_RADIUS = 0.55
export const FOOT_HALF_WIDTH = 5.1
export const FLARE = 1.2
export const SIDE_STRAIGHT = 0.6
export const SIDE_POWER = 3

export const clamp01 = (value) => Math.min(1, Math.max(0, value))

export const slotX = (slot) => (slot - (SLOTS - 1) / 2) * BAY_PITCH
export const finX = (fin) => (fin - SLOTS / 2) * BAY_PITCH

// Half-width of a fin at height y, easing from its base width to its tip width.
export const taper = (base, tip, y, tipY) =>
  tip + (base - tip) * (1 - clamp01((y - FLOOR) / (tipY - FLOOR))) ** 1.25

// A cup outline point and its outward normal, at angle t around the rounded box.
export function cupPoint(t) {
  const c = Math.cos(t)
  const s = Math.sin(t)
  const e = 2 / CUP_ROUNDNESS
  const nx = (Math.sign(c) * Math.abs(c) ** (2 - e)) / CUP_RX
  const nz = (Math.sign(s) * Math.abs(s) ** (2 - e)) / CUP_RZ
  const length = Math.hypot(nx, nz) || 1
  return {
    x: CUP_RX * Math.sign(c) * Math.abs(c) ** e,
    z: CUP_RZ * Math.sign(s) * Math.abs(s) ** e,
    nx: nx / length,
    nz: nz / length,
  }
}

// The pane stands upright behind the tray, then curves back over BEND_LENGTH into the
// leaning sheet. Returns [y, z, bend angle] for a pane point at height y and depth z.
export function bend(y, z) {
  if (y <= BEND_Y) return [y, z, 0]
  const along = y - BEND_Y
  let angle
  let cy
  let cz
  if (along < BEND_LENGTH) {
    angle = along / BEND_RADIUS
    cy = BEND_Y + BEND_RADIUS * Math.sin(angle)
    cz = -BEND_RADIUS * (1 - Math.cos(angle))
  } else {
    angle = TILT
    cy = BEND_Y + BEND_RADIUS * Math.sin(TILT) + (along - BEND_LENGTH) * Math.cos(TILT)
    cz = -BEND_RADIUS * (1 - Math.cos(TILT)) - (along - BEND_LENGTH) * Math.sin(TILT)
  }
  return [cy + z * Math.sin(angle), cz + z * Math.cos(angle), angle]
}

const viewDepth = (y, z) => (EYE_Y - y) * Math.sin(PITCH) + (EYE_Z - z) * Math.cos(PITCH)
const viewHeight = (y, z) =>
  ((y - EYE_Y) * Math.cos(PITCH) + (EYE_Z - z) * Math.sin(PITCH)) / viewDepth(y, z)

const [cornerY, cornerZ] = bend(TOP - CORNER_RADIUS, FACE)
const topView = viewHeight(cornerY, cornerZ)
const footView = viewHeight(FLOOR, FIN_BACK_Z)
const footSlope = FOOT_HALF_WIDTH / viewDepth(FLOOR, FIN_BACK_Z)

// Every point on the side walls sits at x = G(v) × depth, where v is its height on
// screen, so front and back edges line up and the silhouette is one curve: a gentle
// taper out of the rounded top corner that flares toward the base.
export function sideX(y, z) {
  const w = Math.max(0, (topView - viewHeight(y, z)) / (topView - footView))
  const shape = SIDE_STRAIGHT * w + (1 - SIDE_STRAIGHT) * w ** SIDE_POWER
  return footSlope * (1 / FLARE + (1 - 1 / FLARE) * shape) * viewDepth(y, z)
}

export const sideInset = (y, z) => BAY_HALF_WIDTH - sideX(y, z)

export function paneX(y) {
  const [by, bz] = bend(y, FACE)
  return sideX(by, bz)
}

export const PANE_TOP_HALF_WIDTH = paneX(TOP - CORNER_RADIUS)

// Horizontal lean of inner fin k at height y. Inner fins pivot low in the cup zone, so
// their feet splay slightly outward while their tops lean in.
export function finLean(fin, y) {
  const x = finX(fin)
  const reach = (Math.abs(x) / finX(SLOTS - 1)) ** 1.3
  return -Math.sign(x) * LEAN * reach * (clamp01((y - FLOOR) / (FIN_TOP - FLOOR)) ** LEAN_POWER - LEAN_BASE)
}

// The x of a chute wall face at height y: side +1 is the right face, -1 the left, 0 the
// centre line. Only the outer walls follow depth z.
export function wallFace(fin, side, y, z = MOUTH_Z) {
  const outer = taper(OUTER_FIN[0], OUTER_FIN[1], y, FIN_HEIGHT - OUTER_FIN[1] / 2)
  if (fin === 0) return -sideX(y, z) + 0.005 + outer
  if (fin === SLOTS) return sideX(y, z) - 0.005 - outer
  return finX(fin) + finLean(fin, y) + side * taper(INNER_FIN[0], INNER_FIN[1], y, FIN_TOP - INNER_FIN[1])
}

// Each mouth sits centred between its chute's walls and rolls a little with them, so
// the openings fan out with the fins.
export const mouthX = (slot) => (wallFace(slot, 1, MOUTH_Y) + wallFace(slot + 1, -1, MOUTH_Y)) / 2

export function mouthRoll(slot) {
  const h = 0.01
  const slope = (fin) => (wallFace(fin, 0, MOUTH_Y + h) - wallFace(fin, 0, MOUTH_Y - h)) / (2 * h)
  return -MOUTH_ROLL * Math.atan((slope(slot) + slope(slot + 1)) / 2)
}
