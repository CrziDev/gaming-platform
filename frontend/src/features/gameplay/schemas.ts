import { z } from 'zod'

import type { PlayRoundResponse } from '@/api/types'

import { PLINKO_BOARD_ROWS, PLINKO_BOARD_SLOTS, PLINKO_RISKS, type PlinkoBoard } from './multipliers'

export const PROTOCOL_VERSION = 3 as const

const version = z.literal(PROTOCOL_VERSION)
const slot = z.number().int().min(0).max(PLINKO_BOARD_ROWS)
const roundId = z.string().min(1).max(64)

export const plinkoParamsSchema = z.strictObject({
  rows: z.literal(PLINKO_BOARD_ROWS),
  risk: z.enum(PLINKO_RISKS),
})

const pixels = z.number().refine(Number.isFinite, 'Not a finite number')
const size = pixels.refine((value) => value > 0, 'Not a positive size')
const rect = z.strictObject({ x: pixels, y: pixels, width: size, height: size })

// Everything the frame may say to the host. Unknown versions, types, and fields
// fail here, so a message that reaches a handler has the shape the handler expects.
export const frameMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ v: version, type: z.literal('ready'), game: z.literal('plinko') }),
  z.strictObject({ v: version, type: z.literal('landed'), round_id: roundId, slot }),
  z.strictObject({
    v: version,
    type: z.literal('error'),
    code: z.enum(['bad_message', 'unsupported_version', 'runtime']),
    message: z.string().max(200),
  }),
])

export const hostMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    v: version,
    type: z.literal('configure'),
    rows: plinkoParamsSchema.shape.rows,
    risk: plinkoParamsSchema.shape.risk,
    multipliers_hundredths: z.array(z.number().int().positive()).length(PLINKO_BOARD_SLOTS),
    sound: z.boolean(),
  }),
  // The board's rect inside the frame, in CSS pixels. The frame fills the game zone
  // behind the host's controls and frames the board inside this rect; `controls` are the
  // rects those controls cover, which the frame keeps its art clear of.
  z.strictObject({
    v: version,
    type: z.literal('layout'),
    x: pixels,
    y: pixels,
    width: size,
    height: size,
    controls: z.array(rect).max(4),
  }),
  z.strictObject({
    v: version,
    type: z.literal('drop'),
    round_id: roundId,
    slot,
    multiplier_hundredths: z.number().int().positive(),
    result_label: z.string().max(40),
  }),
  z.strictObject({ v: version, type: z.literal('set_sound'), enabled: z.boolean() }),
])

export type FrameMessage = z.infer<typeof frameMessageSchema>
export type HostMessage = z.infer<typeof hostMessageSchema>

const safeInteger = z.number().int().refine((value) => Number.isSafeInteger(value), 'Outside the exact integer range')
const currency = z.enum(['PHP', 'USD'])

const multiplierTable = z.array(safeInteger.positive())

// The manifest is validated before it configures a board. The server still serves
// every row count it settles; the played board must be present for every risk with
// exactly one multiplier per cup, and the rest of the manifest is ignored.
export const plinkoManifestSchema = z
  .object({
    rtp_basis_points: z.number().int().positive(),
    rows: z.array(z.number().int()),
    risks: z.array(z.string()),
    multipliers_hundredths: z.record(z.string(), z.record(z.string(), multiplierTable)),
  })
  .transform((manifest, ctx) => {
    const board: Partial<PlinkoBoard> = {}
    for (const risk of PLINKO_RISKS) {
      const slots = manifest.multipliers_hundredths[String(PLINKO_BOARD_ROWS)]?.[risk]
      if (slots === undefined || slots.length !== PLINKO_BOARD_SLOTS) {
        ctx.addIssue({
          code: 'custom',
          path: ['multipliers_hundredths', String(PLINKO_BOARD_ROWS), risk],
          message: `Expected ${PLINKO_BOARD_SLOTS} multipliers`,
        })
        continue
      }
      board[risk] = slots
    }
    return { rtp_basis_points: manifest.rtp_basis_points, board: board as PlinkoBoard }
  })

export type PlinkoBoards = z.infer<typeof plinkoManifestSchema>

// The live response is validated before it touches state: a round with a float
// for money or a slot outside the board would otherwise be animated as if true.
export const playRoundResponseSchema: z.ZodType<PlayRoundResponse> = z.object({
  round: z.object({
    id: roundId,
    game_id: z.string(),
    game_slug: z.string(),
    game_name: z.string(),
    rtp_basis_points: safeInteger,
    status: z.enum(['open', 'settled', 'cancelled', 'failed']),
    stake_minor: safeInteger,
    win_minor: safeInteger.nullable(),
    multiplier_hundredths: safeInteger.nullable(),
    currency,
    started_at: z.string(),
    settled_at: z.string().nullable(),
  }),
  result: z.record(z.string(), z.union([z.string(), z.number()])),
  wallet: z.object({ currency, balance_minor: safeInteger }),
})
