// Every row count the engine settles; the admin RTP inspector offers each one.
export const PLINKO_ROWS = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const
export type PlinkoRows = (typeof PLINKO_ROWS)[number]

export const PLINKO_RISKS = ['low', 'normal', 'high'] as const
export type PlinkoRisk = (typeof PLINKO_RISKS)[number]

// Players play one board: ten rows of pegs over eleven cups.
export const PLINKO_BOARD_ROWS = 10
export const PLINKO_BOARD_SLOTS = PLINKO_BOARD_ROWS + 1

export type PlinkoParams = { rows: typeof PLINKO_BOARD_ROWS; risk: PlinkoRisk }

export const DEFAULT_PLINKO_PARAMS: PlinkoParams = { rows: PLINKO_BOARD_ROWS, risk: 'normal' }

export type PlinkoTable = Record<PlinkoRows, Record<PlinkoRisk, readonly number[]>>

// The played board's payouts by risk, as the server's manifest serves them.
export type PlinkoBoard = Record<PlinkoRisk, readonly number[]>

export const riskLabels: Record<PlinkoRisk, string> = { low: 'Low', normal: 'Normal', high: 'High' }

export function summarizePlinko(params: PlinkoParams): string {
  return `${params.rows} rows · ${riskLabels[params.risk]}`
}

// The supplied paytable, in integer hundredths (1.7× is 170). It is the demo fixture's
// table only: the live board is configured from `GET /api/games/{slug}/manifest`, and
// every shipped RTP option differs from this on some low-risk boards
// (docs/games/plinko-rtp.md §9).
export const PLINKO_MULTIPLIERS_HUNDREDTHS: PlinkoTable = {
  8: {
    low: [200, 150, 120, 100, 80, 100, 120, 150, 200],
    normal: [600, 300, 170, 110, 50, 110, 170, 300, 600],
    high: [1500, 600, 200, 70, 20, 70, 200, 600, 1500],
  },
  9: {
    low: [220, 160, 130, 110, 90, 90, 110, 130, 160, 220],
    normal: [800, 400, 200, 130, 70, 70, 130, 200, 400, 800],
    high: [2200, 800, 300, 110, 40, 40, 110, 300, 800, 2200],
  },
  10: {
    low: [250, 180, 140, 120, 100, 90, 100, 120, 140, 180, 250],
    normal: [1000, 500, 250, 150, 80, 50, 80, 150, 250, 500, 1000],
    high: [3000, 1000, 400, 150, 50, 20, 50, 150, 400, 1000, 3000],
  },
  11: {
    low: [280, 200, 150, 130, 110, 100, 100, 110, 130, 150, 200, 280],
    normal: [1400, 700, 350, 180, 90, 60, 60, 90, 180, 350, 700, 1400],
    high: [4500, 1500, 600, 200, 70, 30, 30, 70, 200, 600, 1500, 4500],
  },
  12: {
    low: [320, 230, 170, 140, 120, 110, 100, 110, 120, 140, 170, 230, 320],
    normal: [1800, 900, 450, 220, 110, 70, 50, 70, 110, 220, 450, 900, 1800],
    high: [6000, 2000, 800, 300, 100, 40, 20, 40, 100, 300, 800, 2000, 6000],
  },
  13: {
    low: [360, 260, 190, 150, 130, 120, 110, 110, 120, 130, 150, 190, 260, 360],
    normal: [2200, 1200, 600, 300, 140, 80, 60, 60, 80, 140, 300, 600, 1200, 2200],
    high: [9000, 3000, 1200, 450, 150, 50, 20, 20, 50, 150, 450, 1200, 3000, 9000],
  },
  14: {
    low: [420, 300, 220, 170, 140, 130, 120, 110, 120, 130, 140, 170, 220, 300, 420],
    normal: [2800, 1500, 800, 450, 180, 100, 70, 50, 70, 100, 180, 450, 800, 1500, 2800],
    high: [14000, 4500, 1800, 650, 200, 70, 20, 10, 20, 70, 200, 650, 1800, 4500, 14000],
  },
  15: {
    low: [500, 350, 260, 200, 160, 140, 120, 110, 110, 120, 140, 160, 200, 260, 350, 500],
    normal: [4000, 2000, 1100, 600, 250, 120, 80, 50, 50, 80, 120, 250, 600, 1100, 2000, 4000],
    high: [22000, 7000, 2800, 1000, 350, 120, 30, 10, 10, 30, 120, 350, 1000, 2800, 7000, 22000],
  },
  16: {
    low: [600, 420, 310, 240, 190, 160, 140, 120, 110, 120, 140, 160, 190, 240, 310, 420, 600],
    normal: [6000, 3000, 1500, 800, 350, 180, 110, 60, 40, 60, 110, 180, 350, 800, 1500, 3000, 6000],
    high: [50000, 15000, 6000, 2200, 800, 300, 80, 20, 10, 20, 80, 300, 800, 2200, 6000, 15000, 50000],
  },
}

export function plinkoMultipliers(rows: PlinkoRows, risk: PlinkoRisk): readonly number[] {
  return PLINKO_MULTIPLIERS_HUNDREDTHS[rows][risk]
}

export function isPlinkoRows(value: number): value is PlinkoRows {
  return (PLINKO_ROWS as readonly number[]).includes(value)
}

export function isPlinkoRisk(value: string): value is PlinkoRisk {
  return (PLINKO_RISKS as readonly string[]).includes(value)
}
