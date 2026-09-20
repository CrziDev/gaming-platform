import { z } from 'zod'

import type { Currency } from '@/lib/money'
import { parseMoneyInput } from '@/lib/money'

export const gameStatuses = ['draft', 'active', 'maintenance', 'retired'] as const

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

export const paymentMethodSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120, 'Use at most 120 characters'),
  description: z.string().trim().max(1000, 'Use at most 1000 characters'),
  pay_to: z.string().trim().min(1, 'Enter pay-to details').max(500, 'Use at most 500 characters'),
  reference_required: z.boolean(),
  enabled: z.boolean(),
})

export type PaymentMethodFormInput = z.infer<typeof paymentMethodSchema>
