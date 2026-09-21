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

export function createGameSchema() {
  const schema = z.object({
      slug,
      name: z.string().trim().min(1, 'Enter a name').max(120, 'Use at most 120 characters'),
      description: z.string().trim().max(1000, 'Use at most 1000 characters'),
      category_slug: z.string().min(1, 'Choose a category'),
      provider: z.string().trim().min(1, 'Enter a provider').max(80, 'Use at most 80 characters'),
      status: z.enum(gameStatuses),
      php_min_wager: wholeUnits('PHP', 'PHP minimum bet'),
      php_max_wager: wholeUnits('PHP', 'PHP maximum bet'),
      php_wager_step: wholeUnits('PHP', 'PHP bet step'),
      usd_min_wager: wholeUnits('USD', 'USD minimum bet'),
      usd_max_wager: wholeUnits('USD', 'USD maximum bet'),
      usd_wager_step: wholeUnits('USD', 'USD bet step'),
    })
    .superRefine((values, context) => {
      for (const currency of ['PHP', 'USD'] as const) {
        const prefix = currency.toLowerCase() as 'php' | 'usd'
        const minField = `${prefix}_min_wager` as const
        const maxField = `${prefix}_max_wager` as const
        const min = parseMoneyInput(values[minField], currency)
        const max = parseMoneyInput(values[maxField], currency)
        if (min !== null && max !== null && max < min) {
          context.addIssue({ code: 'custom', path: [maxField], message: 'Must be at least the minimum bet' })
        }
      }
    })
  return schema
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
