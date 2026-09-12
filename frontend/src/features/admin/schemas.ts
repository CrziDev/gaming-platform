import { z } from 'zod'

import type { Currency } from '@/lib/money'
import { parseMoneyInput } from '@/lib/money'

export const gameStatuses = ['draft', 'active', 'maintenance', 'retired'] as const

// The Phase 1 target set, in basis points. A draft outside it has no engine
// that could implement it, and the server refuses it too.
export const rtpTargets = [9200, 9400, 9600, 10000, 10200, 10500] as const

const slug = z
  .string()
  .trim()
  .min(1, 'Enter a slug')
  .max(64, 'Use at most 64 characters')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lower-case letters, digits, and single hyphens only')

function wholeUnits(currency: Currency, label: string) {
  return z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .refine((value) => parseMoneyInput(value, currency) !== null, 'Enter a valid amount')
    .refine((value) => (parseMoneyInput(value, currency) ?? 0) > 0, 'Must be more than zero')
    .refine((value) => /^\d+(\.0+)?$/.test(value.replace(/[\s,]/g, '')), 'Whole units only, no cents')
}

export function createGameSchema(currency: Currency) {
  return z
    .object({
      slug,
      name: z.string().trim().min(1, 'Enter a name').max(120, 'Use at most 120 characters'),
      description: z.string().trim().max(1000, 'Use at most 1000 characters'),
      category_slug: z.string().min(1, 'Choose a category'),
      provider: z.string().trim().min(1, 'Enter a provider').max(80, 'Use at most 80 characters'),
      status: z.enum(gameStatuses),
      currency: z.string().min(1, 'Choose a currency'),
      min_wager: wholeUnits(currency, 'minimum bet'),
      max_wager: wholeUnits(currency, 'maximum bet'),
      wager_step: wholeUnits(currency, 'bet step'),
    })
    .superRefine((values, context) => {
      const min = parseMoneyInput(values.min_wager, currency)
      const max = parseMoneyInput(values.max_wager, currency)
      if (min !== null && max !== null && max < min) {
        context.addIssue({ code: 'custom', path: ['max_wager'], message: 'Must be at least the minimum bet' })
      }
    })
}

export type GameFormInput = z.infer<ReturnType<typeof createGameSchema>>

// Form values stay strings until submit; the numbers are counts and basis
// points, never money, so a plain Number() at the boundary is safe.
export const rtpDraftSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80, 'Use at most 80 characters'),
  version: z.string().trim().regex(/^[1-9]\d*$/, 'Version is a whole number starting at 1'),
  target_basis_points: z
    .string()
    .refine((value) => (rtpTargets as readonly number[]).includes(Number(value)), 'Choose a Phase 1 target'),
  engine_config_ref: z.string().trim().max(200, 'Use at most 200 characters'),
})

export type RtpDraftFormInput = z.infer<typeof rtpDraftSchema>
