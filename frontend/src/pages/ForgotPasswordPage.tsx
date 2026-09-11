import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'

import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/features/auth'
import { paths } from '@/routes/paths'

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) })

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-card bg-surface-1 p-6">
        <Link to={paths.lobby} className="mb-6 inline-block text-[18px] font-semibold tracking-[-0.02em] text-ink">
          HeziBet
        </Link>

        {sent ? (
          <div className="flex flex-col gap-4">
            <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Check your email</h1>
            <p className="text-[13.5px] leading-relaxed text-ink-mute text-pretty">
              If that address has an account, a reset link is on its way. The link expires in 30
              minutes.
            </p>
            <Link to={paths.lobby} className="text-[13px] text-accent-ink hover:text-accent-hi">
              Back to the lobby
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(async () => {
              await new Promise((resolve) => window.setTimeout(resolve, 400))
              setSent(true)
            })}
            noValidate
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-2">
              <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Forgot password</h1>
              <p className="text-[13.5px] leading-relaxed text-ink-mute">
                Enter your email and we&rsquo;ll send a reset link.
              </p>
            </div>

            <Field label="Email" htmlFor="forgot-email" error={errors.email?.message}>
              <Input id="forgot-email" type="email" autoComplete="email" {...register('email')} />
            </Field>

            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </Button>

            <Link to={paths.lobby} className="text-center text-[13px] text-accent-ink hover:text-accent-hi">
              Back to the lobby
            </Link>
          </form>
        )}
      </div>
    </main>
  )
}
