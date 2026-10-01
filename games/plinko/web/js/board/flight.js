import {
  BALL_RADIUS,
  CUP_TOP,
  CUP_Z,
  FACE,
  MOUTH_Y,
  MOUTH_Z,
  NOTCH_Y,
  PEG_RADIUS,
  PEG_SPACING,
  ROWS,
  ROW_HEIGHT,
  ROW_TOP,
  mouthX,
  slotX,
} from './geometry.js'

// Each row turns the ball half a peg spacing left (0) or right (1). A ball that turns
// right `slot` times lands in that slot, so any order of those turns is a true path to
// the result the server already settled; the order is shuffled so repeats look fresh.
export function planTurns(slot) {
  const turns = Array.from({ length: ROWS }, (_, i) => (i < slot ? 1 : 0))
  for (let i = turns.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[turns[i], turns[j]] = [turns[j], turns[i]]
  }
  return turns
}

// The flight as timed segments: a fall from the notch onto the top peg, a bounce per
// row, an arc into the chute mouth, and a sink into the cup. Segments marked `onPane`
// are in the leaning pane's frame; `peg` names the peg struck when a segment ends.
export function flightTo(slot, upper, T) {
  const turns = planTurns(slot)
  const contact = PEG_RADIUS + BALL_RADIUS - 0.02
  const z = FACE + BALL_RADIUS * 0.95
  const halfStep = (turn) => (turn ? PEG_SPACING / 2 : -PEG_SPACING / 2)

  let x = 0
  let y = ROW_TOP + contact
  let peg = 1
  const segments = [
    { kind: 'fall', onPane: true, x0: 0, y0: NOTCH_Y, x1: 0, y1: y, z0: FACE / 2, z1: z, duration: 300, peg: '0-1' },
  ]
  for (let row = 0; row < ROWS - 1; row++) {
    peg += turns[row]
    const nextX = x + halfStep(turns[row])
    const nextY = ROW_TOP - (row + 1) * ROW_HEIGHT + contact
    segments.push({
      kind: 'bounce',
      onPane: true,
      x0: x,
      y0: y,
      x1: nextX,
      y1: nextY,
      z0: z,
      z1: z,
      height: 0.32,
      duration: 165,
      peg: `${row + 1}-${peg}`,
    })
    x = nextX
    y = nextY
  }

  const exitX = x + halfStep(turns[ROWS - 1])
  const exitY = y - 0.45
  segments.push({ kind: 'bounce', onPane: true, x0: x, y0: y, x1: exitX, y1: exitY, z0: z, z1: z, height: 0.24, duration: 150 })

  const exit = upper.localToWorld(new T.Vector3(exitX, exitY, z))
  const hover = MOUTH_Y + 0.45
  segments.push({
    kind: 'arc',
    x0: exit.x,
    y0: exit.y,
    z0: exit.z,
    x1: mouthX(slot),
    y1: hover,
    z1: MOUTH_Z,
    height: 0.22,
    duration: 280,
  })
  segments.push({
    kind: 'sink',
    x0: mouthX(slot),
    y0: hover,
    z0: MOUTH_Z,
    x1: slotX(slot),
    y1: CUP_TOP - 0.3,
    z1: CUP_Z,
    duration: 420,
  })
  return segments
}

// The ball's [x, y, z] a fraction t of the way through a segment.
export function positionAt(segment, t) {
  const { x0, y0, z0, x1, y1, z1 } = segment
  switch (segment.kind) {
    case 'fall':
      return [x0, y0 + (y1 - y0) * t * t, z0 + (z1 - z0) * Math.min(1, t * 1.6)]
    case 'bounce': {
      const h = segment.height
      return [x0 + (x1 - x0) * (t * (2 - t) * 0.72 + t * 0.28), y0 + (y1 - y0 + 4 * h) * t * t - 4 * h * t, z0]
    }
    case 'arc': {
      const eased = 1 - (1 - t) * (1 - t)
      return [x0 + (x1 - x0) * eased, y0 + (y1 - y0) * t + segment.height * 4 * t * (1 - t), z0 + (z1 - z0) * eased]
    }
    default: {
      const eased = t * t
      return [x0 + (x1 - x0) * eased, y0 + (y1 - y0) * eased, z0 + (z1 - z0) * eased]
    }
  }
}
