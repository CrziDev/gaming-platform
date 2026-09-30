import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'

import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field, Input } from '@/components/ui/Field'
import { Panel } from '@/components/ui/Panel'
import { useToast } from '@/components/ui/Toast'
import {
  changePasswordSchema,
  useChangePassword,
  useLogout,
  useSession,
  type ChangePasswordInput,
} from '@/features/auth'
import { useWallets } from '@/features/wallet'
import { formatDate } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function AccountPage() {
  const { data: user } = useSession()
  const walletsQuery = useWallets()
  const logoutMutation = useLogout()
  const passwordMutation = useChangePassword()
  const navigate = useNavigate()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) })

  if (!user) {
    return null
  }

  const onPasswordSubmit = handleSubmit(async (values) => {
    try {
      await passwordMutation.mutateAsync(values)
      reset()
      toast.push('Password changed.', 'success')
    } catch (error) {
      if (!(error instanceof ApiError)) return
      if (error.fields.current_password) {
        setError('current_password', { type: 'server', message: error.fields.current_password })
      }
      if (error.fields.password) {
        setError('password', { type: 'server', message: error.fields.password })
      }
    }
  })

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Account</h1>

      <Panel title="Profile" bodyClassName="flex flex-col gap-3 p-5">
        <Row label="Username">{user.display_name}</Row>
        <Row label="Email">
          <span className="break-all">{user.email}</span>
        </Row>
        <Row label="Registered">{formatDate(user.created_at)}</Row>
      </Panel>

      <Panel title="Password" bodyClassName="p-5">
        <form onSubmit={onPasswordSubmit} noValidate className="flex flex-col gap-4">
          <Field
            label="Current password"
            htmlFor="account-current-password"
            error={errors.current_password?.message}
          >
            <Input
              id="account-current-password"
              type="password"
              autoComplete="current-password"
              {...register('current_password')}
            />
          </Field>
          <Field
            label="New password"
            htmlFor="account-new-password"
            error={errors.password?.message}
            hint="12 to 128 characters."
          >
            <Input
              id="account-new-password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
            />
          </Field>
          <Field
            label="Confirm new password"
            htmlFor="account-confirm-password"
            error={errors.confirm_password?.message}
          >
            <Input
              id="account-confirm-password"
              type="password"
              autoComplete="new-password"
              {...register('confirm_password')}
            />
          </Field>

          {passwordMutation.error &&
          (!(passwordMutation.error instanceof ApiError) ||
            Object.keys(passwordMutation.error.fields).length === 0) ? (
            <p role="alert" className="text-[13px] text-danger">
              {passwordMutation.error instanceof ApiError
                ? passwordMutation.error.message
                : 'The password could not be changed. Check your connection and try again.'}
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={passwordMutation.isPending}>
              {passwordMutation.isPending ? 'Saving…' : 'Change password'}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Wallets" bodyClassName="flex flex-col gap-3 p-5">
        {walletsQuery.data?.map((wallet) => (
          <Row key={wallet.currency} label={wallet.currency}>
            <span className="font-medium tnum">
              {formatMoney(money(wallet.balance_minor, wallet.currency))}
            </span>
          </Row>
        ))}
      </Panel>

      <Panel title="Session" bodyClassName="flex flex-col items-start gap-3 p-5">
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Sign out
        </Button>
      </Panel>

      <ConfirmDialog
        open={confirming}
        title="Sign out?"
        description="You'll need to sign in again to reach your wallet and history."
        confirmLabel="Sign out"
        tone="destructive"
        pending={logoutMutation.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await logoutMutation.mutateAsync()
          setConfirming(false)
          await navigate(paths.lobby)
        }}
      />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-mute">{label}</span>
      <span className="text-right text-ink-soft">{children}</span>
    </div>
  )
}
