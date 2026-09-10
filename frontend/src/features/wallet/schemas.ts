import { z } from 'zod'

import { parseMoneyInput } from '@/lib/money'

export const depositLimitsMinor = { min: 10_000, max: 5_000_000 }

export const depositSchema = z.object({
  method_id: z.string().min(1, 'Choose a payment method'),
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((value) => parseMoneyInput(value) !== null, 'Enter a valid amount')
    .refine((value) => (parseMoneyInput(value) ?? 0) >= depositLimitsMinor.min, 'The minimum is ₱100.00')
    .refine(
      (value) => (parseMoneyInput(value) ?? 0) <= depositLimitsMinor.max,
      'The maximum is ₱50,000.00 per request',
    ),
  reference: z
    .string()
    .refine((value) => value.trim().length > 0, 'Enter the reference from your payment app')
    .refine((value) => value.trim().length <= 32, 'Use at most 32 characters'),
})

export type DepositInput = z.infer<typeof depositSchema>
