import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { resetPasswordSchema, type ResetPasswordInput } from '@/features/auth'
import { paths } from '@/routes/paths'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) })

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-card bg-panel p-7">
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden className="size-7 rounded-[9px] bg-accent" />
          <span className="text-[15px] font-semibold">Gaming Platform</span>
        </div>

        <form
          onSubmit={handleSubmit(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 400))
            await navigate(paths.lobby)
          })}
          noValidate
          className="flex flex-col gap-5"
        >
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-ink">Choose a new password</h1>
            <p className="text-[13.5px] leading-relaxed text-ink-mute">
              Once it is saved you will be signed in and returned to the lobby.
            </p>
          </div>

          <Field
            label="New password"
            htmlFor="reset-password"
            error={errors.password?.message}
            hint="12 to 128 characters."
          >
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
            />
          </Field>

          <Field
            label="Confirm password"
            htmlFor="reset-confirm"
            error={errors.confirm_password?.message}
          >
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              {...register('confirm_password')}
            />
          </Field>

          <Button type="submit" fullWidth disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save password'}
          </Button>

          <Link to={paths.lobby} className="text-center text-[13px] text-accent hover:underline">
            Back to the lobby
          </Link>
        </form>
      </div>
    </main>
  )
}
