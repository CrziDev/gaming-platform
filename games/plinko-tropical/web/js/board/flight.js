import {
  BALL_RADIUS,
  BALL_Z,
  CHUTE_Z,
  PEG_RADIUS,
  PEG_SPACING,
  ROWS,
  ROW_HEIGHT,
  ROW_TOP,
  TILE_TOP,
  WAIT_Y,
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

// The flight as timed segments on the face: a fall from the cradle onto the top peg, a
// bounce per row, a last hop off the bottom row, and a drop out of sight behind the
// tile. `peg` names the peg struck when a segment ends.
export function flightTo(slot) {
  const turns = planTurns(slot)
  const contact = PEG_RADIUS + BALL_RADIUS - 0.02
  const halfStep = (turn) => (turn ? PEG_SPACING / 2 : -PEG_SPACING / 2)

  let x = 0
  let y = ROW_TOP + contact
  let peg = 1
  const segments = [
    { kind: 'fall', x0: 0, y0: WAIT_Y, z0: CHUTE_Z, x1: 0, y1: y, z1: BALL_Z, duration: 480, peg: '0-1' },
  ]
  for (let row = 0; row < ROWS - 1; row++) {
    peg += turns[row]
    const nextX = x + halfStep(turns[row])
    const nextY = ROW_TOP - (row + 1) * ROW_HEIGHT + contact
    segments.push({
      kind: 'bounce',
      x0: x,
      y0: y,
      x1: nextX,
      y1: nextY,
      z0: BALL_Z,
      z1: BALL_Z,
      height: 0.34,
      duration: 250,
      peg: `${row + 1}-${peg}`,
    })
    x = nextX
    y = nextY
  }

  const exitX = x + halfStep(turns[ROWS - 1])
  const exitY = y - 0.45
  segments.push({ kind: 'exit', x0: x, y0: y, x1: exitX, y1: exitY, z0: BALL_Z, z1: BALL_Z, height: 0.26, duration: 240 })
  segments.push({ kind: 'sink', x0: exitX, y0: exitY, z0: BALL_Z, x1: slotX(slot), y1: TILE_TOP - 0.3, z1: BALL_Z, duration: 390 })
  return segments
}

// The ball's [x, y, z] a fraction t of the way through a segment. A drop keeps its
// sideways speed while it gathers pace downward, so a ball bound for an outer tile is
// over it before it falls past the divider tops.
export function positionAt(segment, t) {
  const { x0, y0, z0, x1, y1, z1 } = segment
  switch (segment.kind) {
    case 'fall':
      return [x0, y0 + (y1 - y0) * t * t, z0 + (z1 - z0) * Math.min(1, t * 1.6)]
    case 'bounce':
    case 'exit': {
      const h = segment.height
      return [x0 + (x1 - x0) * (t * (2 - t) * 0.72 + t * 0.28), y0 + (y1 - y0 + 4 * h) * t * t - 4 * h * t, z0]
    }
    default: {
      const eased = t * t
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * eased, z0 + (z1 - z0) * eased]
    }
  }
}

export const flightDuration = (segments) => segments.reduce((total, segment) => total + segment.duration, 0)

// The ball's [x, y, z], its segment, and the fraction through it, `elapsed` ms after
// the drop; held at either end of the flight.
export function pathAt(segments, elapsed) {
  let start = 0
  for (const segment of segments) {
    if (elapsed < start + segment.duration) {
      const t = Math.max(0, (elapsed - start) / segment.duration)
      return [...positionAt(segment, t), segment, t]
    }
    start += segment.duration
  }
  const last = segments[segments.length - 1]
  return [...positionAt(last, 1), last, 1]
}
