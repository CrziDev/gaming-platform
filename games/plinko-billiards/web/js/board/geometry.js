// Dimensions of the billiard table, in scene units. The playing surface lives in the
// table frame: x across, y up the slope from the foot cushion's nose, z out of the
// cloth. The platform plays one board, eight rows of balls over nine pockets.

export const ROWS = 8
export const SLOTS = ROWS + 1

// The rack of object balls on the cloth.
export const PEG_SPACING = 0.9
export const ROW_HEIGHT = 0.95
export const ROW_BOTTOM = 1.5
export const ROW_TOP = ROW_BOTTOM + (ROWS - 1) * ROW_HEIGHT
export const PEG_RADIUS = 0.22
export const BALL_RADIUS = 0.22
export const NOTCH_Y = ROW_TOP + 1.05
export const TOP = ROW_TOP + 1.8

// The table leans back TILT from upright over a vertical apron; the camera looks down
// at PITCH, so the cloth is seen a quarter of the way to edge-on.
export const TILT = 0.85
export const PITCH = 0.42
export const BASE_Y = 1.6

// Cloth, cushions, and the mitred rails, from the cushion nose outward.
export const CLOTH_HALF_WIDTH = 5.0
export const CUSHION_WIDTH = 0.24
export const CUSHION_HEIGHT = 0.27
export const CUSHION_NOSE = 0.2
export const RAIL_WIDTH = 0.62
export const RAIL_HEIGHT = 0.3
export const RAIL_DEPTH = 0.36
export const RAIL_BEVEL = 0.05
export const INNER_HALF_WIDTH = CLOTH_HALF_WIDTH + CUSHION_WIDTH
export const OUTER_HALF_WIDTH = INNER_HALF_WIDTH + RAIL_WIDTH
export const FOOT_Y = -CUSHION_WIDTH - RAIL_WIDTH
export const HEAD_Y = TOP + CUSHION_WIDTH + RAIL_WIDTH

// Nine pockets cut through the cloth along the foot cushion.
export const BAY_HALF_WIDTH = 4.95
export const BAY_PITCH = (2 * BAY_HALF_WIDTH) / SLOTS
export const POCKET_R = 0.36
export const POCKET_Y = 0.54
export const POCKET_DEPTH = 0.6
export const RING_REST = 0.14
export const PLATE_REST = 0.5

// The apron hangs upright under the foot rail and carries the pocket plates.
export const APRON_HEIGHT = 1.4
export const APRON_INSET = 0.12
export const PLATE_WIDTH = 1.04
export const PLATE_HEIGHT = 0.62

export const clamp01 = (value) => Math.min(1, Math.max(0, value))

export const slotX = (slot) => (slot - (SLOTS - 1) / 2) * BAY_PITCH

// A small repeatable random stream, so the rack looks the same on every load.
export function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
