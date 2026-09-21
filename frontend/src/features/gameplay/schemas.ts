import { z } from 'zod'

import type { PlayRoundResponse } from '@/api/types'

import { PLINKO_RISKS, PLINKO_ROWS, type PlinkoRisk, type PlinkoTable } from './multipliers'

export const PROTOCOL_VERSION = 1 as const

const version = z.literal(PROTOCOL_VERSION)
const slot = z.number().int().min(0).max(16)
const roundId = z.string().min(1).max(64)

export const plinkoParamsSchema = z.strictObject({
  rows: z.union(PLINKO_ROWS.map((rows) => z.literal(rows))),
  risk: z.enum(PLINKO_RISKS),
})

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
    multipliers_hundredths: z.array(z.number().int().positive()).min(9).max(17),
    sound: z.boolean(),
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

// The manifest is validated before it configures a board. Every board the controls
// offer must be present with exactly rows + 1 slots — the frame rejects any other
// length — and the parsed form is the table the session reads by rows and risk.
export const plinkoManifestSchema = z
  .object({
    rtp_basis_points: z.number().int().positive(),
    rows: z.array(z.number().int()),
    risks: z.array(z.string()),
    multipliers_hundredths: z.record(z.string(), z.record(z.string(), multiplierTable)),
  })
  .transform((manifest, ctx) => {
    const table: Partial<PlinkoTable> = {}
    for (const rows of PLINKO_ROWS) {
      const byRisk: Partial<Record<PlinkoRisk, readonly number[]>> = {}
      for (const risk of PLINKO_RISKS) {
        const slots = manifest.multipliers_hundredths[String(rows)]?.[risk]
        if (slots === undefined || slots.length !== rows + 1) {
          ctx.addIssue({
            code: 'custom',
            path: ['multipliers_hundredths', String(rows), risk],
            message: `Expected ${rows + 1} multipliers`,
          })
          continue
        }
        byRisk[risk] = slots
      }
      table[rows] = byRisk as Record<PlinkoRisk, readonly number[]>
    }
    return { rtp_basis_points: manifest.rtp_basis_points, table: table as PlinkoTable }
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
