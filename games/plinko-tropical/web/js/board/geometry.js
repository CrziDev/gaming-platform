// Dimensions of the slate board, in scene units: y is up, z points at the camera, and
// the slate's face is z = 0. The platform plays one board, ten rows of pegs over eleven
// tiles.

export const ROWS = 10
export const SLOTS = ROWS + 1

export const PEG_SPACING = 0.8
export const ROW_HEIGHT = 0.78
export const PEG_RADIUS = 0.14
export const BALL_RADIUS = 0.17
export const BALL_Z = BALL_RADIUS + 0.03

// The face's foot, from the middle out to either wall.
export const FOOT_HALF_WIDTH = 5.0
export const BOTTOM = 0

// The payout tray fills the foot wall to wall: square tiles stand on its floor between
// dividers, the outer two against the rim's ledge. The tiles sit wider apart than the
// pegs, so a ball leaving the bottom row drifts out to its tile as it drops. The tiles
// stand just in front of the falling ball, so it drops out of sight behind one. The
// camera looks down on the tray, so a tile stands a little taller than it is wide to
// read square.
export const TRAY_FLOOR = 0.16
export const TRAY_HALF_WIDTH = FOOT_HALF_WIDTH - 0.03
export const DIVIDER_WIDTH = 0.09
export const SLOT_WIDTH = (2 * TRAY_HALF_WIDTH - DIVIDER_WIDTH) / SLOTS
export const TILE_WIDTH = SLOT_WIDTH - DIVIDER_WIDTH - 0.04
export const TILE_HEIGHT = TILE_WIDTH * 1.06
export const TILE_DEPTH = 0.06
export const TILE_BEVEL = 0.014
export const TILE_RADIUS = 0.07
export const TILE_TOP = TRAY_FLOOR + TILE_HEIGHT
export const TILE_FRONT_Z = BALL_Z + BALL_RADIUS + TILE_DEPTH + 0.01
export const TILE_Z = TILE_FRONT_Z - TILE_DEPTH / 2
export const TRAY_FRONT_Z = TILE_FRONT_Z + 0.06
export const DIVIDER_TOP = TILE_TOP + 0.08

// The peg field, from the bottom row up to the neck.
export const ROW_BOTTOM = DIVIDER_TOP + 0.6
export const ROW_TOP = ROW_BOTTOM + (ROWS - 1) * ROW_HEIGHT
export const TOP = ROW_TOP + 0.85

// The face: a neck at TOP wide enough to hold the cradle, sides running down beside
// the peg field to the shoulders, and upright walls around the tray. Corner radii run
// in outline order: the foot corners, the right shoulder, the neck, and the left
// shoulder.
export const NECK_HALF_WIDTH = 1.05
export const SHOULDER_Y = ROW_BOTTOM - 0.28
export const SLATE_DEPTH = 0.3
const CORNER_RADII = [0.24, 0.24, 0.6, 0.3, 0.3, 0.6]

// The rim around the face, and the lights set into it.
export const RIM_WIDTH = 0.3
export const RIM_DEPTH = 0.16
export const BULB_SPACING = 2.1

// The cradle: a U dipping from the middle of the neck, its rim thinner than the sides
// by CRADLE_TAPER. CRADLE_RADIUS is the U's inner radius at the rim's outer edge, and
// its centre sits on that edge, so the U's mouth meets the top square.
export const CRADLE_RADIUS = 0.44
const CRADLE_TAPER = 0.6
export const CRADLE_Y = TOP + RIM_WIDTH

// The chute standing on the cradle's mouth and the ball resting in the cradle.
export const CHUTE_HALF_WIDTH = CRADLE_RADIUS
export const CHUTE_HEIGHT = 7
export const CHUTE_Z = RIM_DEPTH
export const WAIT_RADIUS = 0.34
export const WAIT_Y = CRADLE_Y - (CRADLE_RADIUS - WAIT_RADIUS)

// The framed camera looks down a little, so the tiles' tops just show.
export const PITCH = 0.12

export const clamp01 = (value) => Math.min(1, Math.max(0, value))

export const slotX = (slot) => (slot - (SLOTS - 1) / 2) * SLOT_WIDTH

// The outline's corners, every edge pushed out by d (in by a negative d).
export function outlineCorners(d) {
  const base = [
    [-FOOT_HALF_WIDTH, BOTTOM],
    [FOOT_HALF_WIDTH, BOTTOM],
    [FOOT_HALF_WIDTH, SHOULDER_Y],
    [NECK_HALF_WIDTH, TOP],
    [-NECK_HALF_WIDTH, TOP],
    [-FOOT_HALF_WIDTH, SHOULDER_Y],
  ]
  const count = base.length
  const lines = base.map(([x0, y0], i) => {
    const [x1, y1] = base[(i + 1) % count]
    const length = Math.hypot(x1 - x0, y1 - y0)
    const nx = (y1 - y0) / length
    const ny = -(x1 - x0) / length
    return { nx, ny, c: nx * x0 + ny * y0 + d }
  })
  return base.map((_, i) => {
    const a = lines[(i + count - 1) % count]
    const b = lines[i]
    const det = a.nx * b.ny - a.ny * b.nx
    return [(a.c * b.ny - b.c * a.ny) / det, (a.nx * b.c - b.nx * a.c) / det]
  })
}

// Points counter-clockwise around the outline pushed out by d, each corner rounded to
// its radius plus d so every offset stays concentric with the face. The cradle dips
// from the neck between the right and left neck corners unless it is left out.
export function outlinePoints(d, steps = 12, { cradle = true } = {}) {
  const corners = outlineCorners(d)
  const count = corners.length
  const points = []
  corners.forEach(([x, y], i) => {
    const [px, py] = corners[(i + count - 1) % count]
    const [qx, qy] = corners[(i + 1) % count]
    const toPrevious = Math.hypot(px - x, py - y)
    const toNext = Math.hypot(qx - x, qy - y)
    const ux = (px - x) / toPrevious
    const uy = (py - y) / toPrevious
    const vx = (qx - x) / toNext
    const vy = (qy - y) / toNext
    const angle = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)))
    const radius = CORNER_RADII[i] + d
    const reach = radius / Math.tan(angle / 2)
    const bisector = Math.hypot(ux + vx, uy + vy)
    const centreDistance = radius / Math.sin(angle / 2)
    const cx = x + ((ux + vx) / bisector) * centreDistance
    const cy = y + ((uy + vy) / bisector) * centreDistance
    const from = Math.atan2(y + uy * reach - cy, x + ux * reach - cx)
    let to = Math.atan2(y + vy * reach - cy, x + vx * reach - cx)
    while (to < from) to += Math.PI * 2
    for (let k = 0; k <= steps; k++) {
      const a = from + ((to - from) * k) / steps
      points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius])
    }
    if (cradle && i === 3) points.push(...cradlePoints(d, steps * 2))
  })
  return points
}

// The U from its right mouth round to its left, pushed out by d: an arc about the
// cradle's centre that meets the neck's top edge in a crisp corner.
function cradlePoints(d, steps) {
  const radius = CRADLE_RADIUS + (RIM_WIDTH - d) * CRADLE_TAPER
  const drop = CRADLE_Y - (TOP + d)
  const from = -Math.asin(drop / radius)
  const to = -Math.PI - from
  const points = []
  for (let k = 0; k <= steps; k++) {
    const a = from + ((to - from) * k) / steps
    points.push([Math.cos(a) * radius, CRADLE_Y + Math.sin(a) * radius])
  }
  return points
}

// Evenly spaced points around a closed loop, about `spacing` apart, an even count
// starting half a step from the loop's first point so they pair across the middle.
// Each comes with the loop's direction there.
export function spacedAround(points, spacing) {
  const loop = [...points, points[0]]
  const lengths = [0]
  for (let i = 1; i < loop.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]))
  }
  const total = lengths[lengths.length - 1]
  const count = 2 * Math.max(1, Math.round(total / spacing / 2))
  const spaced = []
  let j = 1
  for (let k = 0; k < count; k++) {
    const target = ((k + 0.5) * total) / count
    while (lengths[j] < target) j++
    const t = (target - lengths[j - 1]) / (lengths[j] - lengths[j - 1] || 1)
    const [x0, y0] = loop[j - 1]
    const [x1, y1] = loop[j]
    spaced.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, angle: Math.atan2(y1 - y0, x1 - x0) })
  }
  return spaced
}

// The outline pushed out by d without the cradle, starting at the middle of its foot.
export function loopFromFoot(d, steps) {
  const points = outlinePoints(d, steps, { cradle: false })
  return [[0, BOTTOM - d], ...points.slice(steps + 1), ...points.slice(0, steps + 1)]
}
