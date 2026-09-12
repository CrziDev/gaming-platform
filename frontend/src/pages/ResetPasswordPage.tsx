import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import {
  describeResetFailure,
  resetPasswordSchema,
  useConfirmPasswordReset,
  type ResetPasswordInput,
} from '@/features/auth'
import { paths } from '@/routes/paths'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const confirm = useConfirmPasswordReset()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await confirm.mutateAsync({ token, password: values.password })
      await navigate(paths.lobby)
    } catch (error) {
      if (error instanceof ApiError && error.fields.password) {
        setError('password', { type: 'server', message: error.fields.password })
      }
    }
  })

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-card bg-surface-1 p-6">
        <Link to={paths.lobby} className="mb-6 inline-block text-[18px] font-semibold tracking-[-0.02em] text-ink">
          HeziBet
        </Link>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Choose a new password</h1>
            <p className="text-[13.5px] leading-relaxed text-ink-mute">
              Once it is saved, every other session on your account is signed out and you return
              to the lobby.
            </p>
          </div>

          {token === '' ? (
            <p role="alert" className="rounded-input bg-danger/10 px-3.5 py-3 text-[13px] text-ink-soft">
              This reset link is incomplete. Open the link from your email again or request a new
              one.
            </p>
          ) : null}

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

          {confirm.error ? (
            <p role="alert" className="text-[13px] text-danger">
              {describeResetFailure(confirm.error)}
            </p>
          ) : null}

          <Button type="submit" fullWidth disabled={confirm.isPending || token === ''}>
            {confirm.isPending ? 'Saving…' : 'Save password'}
          </Button>

          <Link to={paths.forgotPassword} className="text-center text-[13px] text-accent-ink hover:text-accent-hi">
            Request a new link
          </Link>
        </form>
      </div>
    </main>
  )
}
