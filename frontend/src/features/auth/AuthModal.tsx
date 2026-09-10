import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'

import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { UnderlineTabs } from '@/components/ui/Tabs'
import { paths } from '@/routes/paths'

import { useSessionExpired } from './expiry'
import { useAuthIntent, type AuthTab } from './intent'
import { useLogin, useRegister } from './hooks'
import {
  currencies,
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from './schemas'

const tabs = [
  { id: 'signin' as const, label: 'Sign in' },
  { id: 'join' as const, label: 'Join now' },
]

export function AuthModal() {
  const { intent, close, setTab } = useAuthIntent()
  const expired = useSessionExpired()

  if (!intent || expired) {
    return null
  }

  const joining = intent.tab === 'join'

  return (
    <Modal
      open
      onClose={close}
      title={joining ? 'Join now' : intent.context ? 'Sign in to play' : 'Sign in'}
      description={
        joining
          ? 'Takes about a minute.'
          : intent.context
            ? `${intent.context} is waiting — you'll land straight in it.`
            : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <UnderlineTabs
          items={tabs}
          value={intent.tab}
          onChange={(tab: AuthTab) => setTab(tab)}
          label="Sign in or join"
        />
        {joining ? <JoinForm /> : <SignInForm />}
      </div>
    </Modal>
  )
}

function useAfterAuth() {
  const { intent, close } = useAuthIntent()
  const navigate = useNavigate()

  return async () => {
    const target = intent?.redirectTo
    close()
    if (target) {
      await navigate(target)
    }
  }
}

function SignInForm() {
  const { setTab } = useAuthIntent()
  const loginMutation = useLogin()
  const afterAuth = useAfterAuth()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await loginMutation.mutateAsync(values)
      await afterAuth()
    } catch {
      return
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Email" htmlFor="signin-email" error={errors.email?.message}>
        <Input id="signin-email" type="email" autoComplete="email" {...register('email')} />
      </Field>

      <Field
        label="Password"
        htmlFor="signin-password"
        error={errors.password?.message}
        action={
          <Link to={paths.forgotPassword} className="text-[13px] text-accent hover:underline">
            Forgot?
          </Link>
        }
      >
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
      </Field>

      <label className="flex min-h-11 items-center gap-2.5 text-sm text-ink-mute">
        <input type="checkbox" name="keep_signed_in" className="size-4 accent-[#3d8bff]" />
        Keep me signed in
      </label>

      {loginMutation.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {errorMessage(loginMutation.error)}
        </p>
      ) : null}

      <Button type="submit" fullWidth disabled={loginMutation.isPending}>
        {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-center text-[13px] text-ink-mute">
        New here?{' '}
        <button type="button" onClick={() => setTab('join')} className="text-accent hover:underline">
          Join now
        </button>
      </p>
    </form>
  )
}

function JoinForm() {
  const { setTab } = useAuthIntent()
  const registerMutation = useRegister()
  const afterAuth = useAfterAuth()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { currency: 'PHP' },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerMutation.mutateAsync(values)
      await afterAuth()
    } catch (error) {
      if (!(error instanceof ApiError)) {
        return
      }
      for (const field of ['display_name', 'email', 'password'] as const) {
        const message = error.fields[field]
        if (message) {
          setError(field, { type: 'server', message })
        }
      }
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Username" htmlFor="join-name" error={errors.display_name?.message}>
        <Input id="join-name" type="text" autoComplete="username" {...register('display_name')} />
      </Field>

      <Field label="Email" htmlFor="join-email" error={errors.email?.message}>
        <Input id="join-email" type="email" autoComplete="email" {...register('email')} />
      </Field>

      <Field
        label="Password"
        htmlFor="join-password"
        error={errors.password?.message}
        hint="12 to 128 characters."
      >
        <Input
          id="join-password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
      </Field>

      <Field
        label="Account currency"
        htmlFor="join-currency"
        error={errors.currency?.message}
        hint="Permanent — your wallet, deposits and history all use this currency."
      >
        <Select id="join-currency" {...register('currency')}>
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.label}
            </option>
          ))}
        </Select>
      </Field>

      <label className="flex items-start gap-2.5 py-1 text-[13px] leading-relaxed text-ink-mute">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-[#3d8bff]"
          {...register('accepted_terms')}
        />
        I&rsquo;m 18 or older and accept the terms and privacy policy.
      </label>
      {errors.accepted_terms ? (
        <p role="alert" className="-mt-2 text-[13px] text-danger">
          {errors.accepted_terms.message}
        </p>
      ) : null}

      {registerMutation.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {errorMessage(registerMutation.error)}
        </p>
      ) : null}

      <Button type="submit" fullWidth disabled={registerMutation.isPending}>
        {registerMutation.isPending ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-[13px] text-ink-mute">
        Already registered?{' '}
        <button type="button" onClick={() => setTab('signin')} className="text-accent hover:underline">
          Sign in
        </button>
      </p>
    </form>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && Object.keys(error.fields).length === 0) {
    return error.message
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}
