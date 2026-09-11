import { z } from 'zod'

import type { DepositLimits } from './api'
import type { Currency } from '@/lib/money'
import { formatMoney, money, parseMoneyInput } from '@/lib/money'

export const fallbackDepositLimits: DepositLimits = {
  currency: 'PHP',
  min_minor: 10_000,
  max_minor: 5_000_000,
}

export function createDepositSchema(currency: Currency, limits: DepositLimits) {
  return z.object({
    method_id: z.string().min(1, 'Choose a payment method'),
    amount: z
      .string()
      .min(1, 'Enter an amount')
      .refine((value) => parseMoneyInput(value, currency) !== null, 'Enter a valid amount')
      .refine(
        (value) => (parseMoneyInput(value, currency) ?? 0) >= limits.min_minor,
        `The minimum is ${formatMoney(money(limits.min_minor, currency))}`,
      )
      .refine(
        (value) => (parseMoneyInput(value, currency) ?? 0) <= limits.max_minor,
        `The maximum is ${formatMoney(money(limits.max_minor, currency))} per request`,
      ),
    reference: z.string().refine((value) => value.trim().length <= 120, 'Use at most 120 characters'),
  })
}

export type DepositInput = z.infer<ReturnType<typeof createDepositSchema>>
