import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export const registerSchema = z.object({
  display_name: z
    .string()
    .refine((value) => value.trim().length > 0, 'Enter a username')
    .refine((value) => value.trim().length <= 80, 'Use at most 80 characters'),
  email: z
    .email('Enter a valid email address')
    .refine((value) => value.length <= 254, 'That email address is too long'),
  password: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(128, 'Use at most 128 characters'),
  accepted_terms: z.literal(true, { error: 'Confirm you are 18 or older and accept the terms' }),
})

export const adminLoginSchema = z.object({
  email: z.email('Enter your work email address'),
  password: z.string().min(1, 'Enter your password'),
})

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address'),
})

export const resetPasswordSchema = z
  .object({
    password: z.string().min(12, 'Use at least 12 characters').max(128, 'Use at most 128 characters'),
    confirm_password: z.string(),
  })
  .refine((values) => values.password === values.confirm_password, {
    path: ['confirm_password'],
    error: 'Both passwords must match',
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type AdminLoginInput = z.infer<typeof adminLoginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
