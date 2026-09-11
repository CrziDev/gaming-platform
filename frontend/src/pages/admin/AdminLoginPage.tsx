import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { adminLoginSchema, useAdminLogin, type AdminLoginInput } from '@/features/auth'
import { adminPaths } from '@/routes/paths'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const loginMutation = useAdminLogin()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLoginInput>({ resolver: zodResolver(adminLoginSchema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await loginMutation.mutateAsync(values)
      await navigate(adminPaths.dashboard, { replace: true })
    } catch {
      return
    }
  })

  return (
    <main className="flex min-h-dvh items-center justify-center bg-base p-6">
      <div className="w-full max-w-100 rounded-card bg-panel p-7">
        <header className="mb-6 flex items-center gap-3">
          <span aria-hidden className="size-9 rounded-input bg-surface-3" />
          <div className="flex flex-col">
            <h1 className="text-[17px] font-semibold">Operations console</h1>
            <span className="label-mono text-ink-mute">Staff access only</span>
          </div>
        </header>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Work email" htmlFor="admin-email" error={errors.email?.message}>
            <Input id="admin-email" type="email" autoComplete="email" {...register('email')} />
          </Field>

          <Field label="Password" htmlFor="admin-password" error={errors.password?.message}>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
          </Field>

          <Field
            label="Authenticator code"
            htmlFor="admin-code"
            error={errors.authenticator_code?.message}
          >
            <Input
              id="admin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              className="font-mono text-lg tracking-[0.4em]"
              {...register('authenticator_code')}
            />
          </Field>

          {loginMutation.error ? (
            <p role="alert" className="text-[13px] text-danger">
              {loginMutation.error.message}
            </p>
          ) : null}

          <Button type="submit" fullWidth disabled={loginMutation.isPending}>
            {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="text-[12px] leading-relaxed text-ink-mute">
            No register link, no password self-reset, no &ldquo;remember me&rdquo;. Accounts are
            provisioned by an owner; lockout after 5 attempts.
          </p>
        </form>
      </div>
    </main>
  )
}
