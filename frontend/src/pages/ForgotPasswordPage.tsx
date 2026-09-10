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
      <div className="w-full max-w-md rounded-sheet border border-line bg-panel p-7">
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden className="size-7 rounded-[9px] bg-accent shadow-glow" />
          <span className="font-display text-[15px] font-semibold">Gaming Platform</span>
        </div>

        {sent ? (
          <div className="flex flex-col gap-4">
            <h1 className="font-display text-xl font-semibold text-ink">Check your email</h1>
            <p className="text-sm leading-relaxed text-ink-mute">
              If that address has an account, a reset link is on its way. The link expires in 30
              minutes.
            </p>
            <Link to={paths.lobby} className="text-sm text-accent hover:underline">
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
              <h1 className="font-display text-xl font-semibold text-ink">Forgot password</h1>
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

            <Link to={paths.lobby} className="text-center text-[13px] text-accent hover:underline">
              Back to the lobby
            </Link>
          </form>
        )}
      </div>
    </main>
  )
}
