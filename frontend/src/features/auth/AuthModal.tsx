import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'

import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ChipTabs } from '@/components/ui/Tabs'
import { paths } from '@/routes/paths'

import { useSessionExpired } from './expiry'
import { useAuthIntent, type AuthTab } from './intent'
import { useLogin, useRegister } from './hooks'
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from './schemas'

const tabs = [
  { id: 'signin' as const, label: 'Sign in' },
  { id: 'join' as const, label: 'Join now' },
]

const signInFormId = 'signin-form'
const joinFormId = 'join-form'

export function AuthModal() {
  const { intent, close, setTab } = useAuthIntent()
  const expired = useSessionExpired()
  const loginMutation = useLogin()
  const registerMutation = useRegister()

  if (!intent || expired) {
    return null
  }

  const joining = intent.tab === 'join'
  const pending = joining ? registerMutation.isPending : loginMutation.isPending

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
      footer={
        joining ? (
          <Button type="submit" form={joinFormId} fullWidth disabled={pending}>
            {pending ? 'Creating account…' : 'Create account'}
          </Button>
        ) : (
          <Button type="submit" form={signInFormId} fullWidth disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5 lg:gap-4">
        <ChipTabs
          items={tabs}
          value={intent.tab}
          onChange={(tab: AuthTab) => setTab(tab)}
          label="Sign in or join"
        />
        {joining ? <JoinForm mutation={registerMutation} /> : <SignInForm mutation={loginMutation} />}
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

function SignInForm({ mutation }: { mutation: ReturnType<typeof useLogin> }) {
  const afterAuth = useAfterAuth()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values)
      await afterAuth()
    } catch {
      return
    }
  })

  return (
    <form id={signInFormId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4 lg:gap-3">
      <Field label="Email" htmlFor="signin-email" error={errors.email?.message}>
        <Input id="signin-email" type="email" autoComplete="email" {...register('email')} />
      </Field>

      <Field
        label="Password"
        htmlFor="signin-password"
        error={errors.password?.message}
        action={
          <Link to={paths.forgotPassword} className="text-[13px] text-accent-ink hover:text-accent-hi">
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

      {mutation.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
    </form>
  )
}

function JoinForm({ mutation }: { mutation: ReturnType<typeof useRegister> }) {
  const afterAuth = useAfterAuth()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values)
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
    <form id={joinFormId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4 lg:gap-3">
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

      <label className="flex items-start gap-2.5 py-0.5 text-[13px] leading-relaxed text-ink-mute">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-accent"
          {...register('accepted_terms')}
        />
        I&rsquo;m 18 or older and accept the terms and privacy policy.
      </label>
      {errors.accepted_terms ? (
        <p role="alert" className="-mt-2 text-[13px] text-danger">
          {errors.accepted_terms.message}
        </p>
      ) : null}

      {mutation.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {errorMessage(mutation.error)}
        </p>
      ) : null}
    </form>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && Object.keys(error.fields).length === 0) {
    return error.message
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}
