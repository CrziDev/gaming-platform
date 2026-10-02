import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ChevronLeft, Clock3, Smartphone } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'

import { ApiError } from '@/api/client'
import type { PaymentMethod } from '@/api/types'
import { Button, buttonStyles } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import {
  createWithdrawalSchema,
  useActiveWallet,
  usePaymentMethods,
  useSubmitWithdrawal,
  useWithdrawalLimits,
  useWithdrawals,
  type WithdrawalInput,
  type WithdrawalLimits,
} from '@/features/wallet'
import { cn } from '@/lib/cn'
import { currencySymbol, formatMoney, money, parseMoneyInput, type Currency } from '@/lib/money'
import { createUUID } from '@/lib/uuid'
import { paths } from '@/routes/paths'

const serverFields: Record<string, keyof WithdrawalInput> = {
  method_id: 'method_id',
  amount_minor: 'amount',
  account_name: 'account_name',
  account_number: 'account_number',
}

export function CashOutPage() {
  const methodsQuery = usePaymentMethods()
  const walletQuery = useActiveWallet()
  const limitsQuery = useWithdrawalLimits()
  const pendingQuery = useWithdrawals('pending')

  const loading = methodsQuery.isPending || walletQuery.isPending || limitsQuery.isPending || pendingQuery.isPending
  if (loading) {
    return <CashOutSkeleton />
  }

  if (methodsQuery.isError || walletQuery.isError || limitsQuery.isError || pendingQuery.isError) {
    return (
      <ErrorState
        title="Cash out unavailable"
        message="Your balance and payout methods could not be loaded."
        onRetry={() => {
          void methodsQuery.refetch()
          void walletQuery.refetch()
          void limitsQuery.refetch()
          void pendingQuery.refetch()
        }}
      />
    )
  }

  const wallet = walletQuery.data
  const pending = pendingQuery.data.find((request) => request.currency === wallet.currency)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link
          to={paths.wallet}
          aria-label="Back to wallet"
          className="flex size-11 items-center justify-center rounded-input bg-inset text-ink-mute hover:bg-wash hover:text-ink-soft"
        >
          <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
        </Link>
        <h1 className="text-[20px] font-bold tracking-[-0.02em] text-ink">Cash out</h1>
        <span className="ml-auto rounded-chip bg-inset px-2.5 py-1.5 text-[12.5px] font-medium tnum">
          {formatMoney(money(wallet.balance_minor, wallet.currency), { decimals: 'trim' })}
        </span>
      </header>

      {pending ? (
        <section className="flex flex-col gap-3 rounded-card glass-panel p-5">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink-soft">
            A withdrawal is waiting for review
          </h2>
          <p className="text-[13px] leading-relaxed text-ink-mute">
            {formatMoney(money(pending.amount_minor, pending.currency))} to {pending.method_name}. You can request
            another once it has been reviewed.
          </p>
          <Link to={paths.withdrawalStatus(pending.id)} className={buttonStyles('secondary', 'md', true)}>
            View request
          </Link>
        </section>
      ) : methodsQuery.data.length === 0 ? (
        <p className="rounded-card glass-panel p-6 text-sm text-ink-mute">
          Cash out is temporarily unavailable. Please try again later.
        </p>
      ) : (
        <CashOutForm
          methods={methodsQuery.data}
          currency={wallet.currency}
          balanceMinor={wallet.balance_minor}
          limits={limitsQuery.data}
        />
      )}
    </div>
  )
}

type CashOutFormProps = {
  methods: PaymentMethod[]
  currency: Currency
  balanceMinor: number
  limits: WithdrawalLimits
}

function CashOutForm({ methods, currency, balanceMinor, limits }: CashOutFormProps) {
  const submitWithdrawal = useSubmitWithdrawal()
  const navigate = useNavigate()
  const toast = useToast()
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)
  // One key per form, not per click: a retry after a dropped connection must
  // find the original request on the server instead of debiting twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => createUUID())
  const schema = useMemo(
    () => createWithdrawalSchema(currency, limits, balanceMinor),
    [currency, limits, balanceMinor],
  )

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<WithdrawalInput>({
    resolver: zodResolver(schema),
    defaultValues: { method_id: '', amount: '', account_name: '', account_number: '' },
  })

  const selectedMethod = useWatch({ control, name: 'method_id' })
  const soleMethod = methods.length === 1 ? methods[0] : undefined

  useEffect(() => {
    if (soleMethod && selectedMethod === '') {
      setValue('method_id', soleMethod.id)
    }
  }, [soleMethod, selectedMethod, setValue])

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(undefined)
    let created
    try {
      created = await submitWithdrawal.mutateAsync({
        method_id: values.method_id,
        currency,
        amount_minor: parseMoneyInput(values.amount, currency) ?? 0,
        account_name: values.account_name.trim(),
        account_number: values.account_number.trim(),
        idempotency_key: idempotencyKey,
      })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setSubmitError('The request could not be sent. Check your connection and try again.')
        return
      }
      setIdempotencyKey(createUUID())
      if (error.code === 'INSUFFICIENT_BALANCE') {
        setError('amount', { type: 'server', message: 'This is more than your balance' })
        return
      }
      let placed = false
      for (const [sent, field] of Object.entries(serverFields)) {
        const message = error.fields[sent]
        if (message) {
          setError(field, { type: 'server', message })
          placed = true
        }
      }
      if (!placed) {
        setSubmitError(error.message)
      }
      return
    }

    toast.push('Withdrawal requested. You’ll be notified once it’s reviewed.', 'success')
    await navigate(paths.withdrawalStatus(created.id), { replace: true })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 rounded-card glass-panel p-4 sm:p-5">
      <fieldset className="min-w-0 border-b border-hairline-soft pb-6">
        <legend className="text-[14px] font-semibold text-ink-soft">Payout method</legend>
        <div className="mt-3 flex min-w-0 flex-col gap-2">
          {methods.map((method) => {
            const selected = selectedMethod === method.id
            return (
              <label
                key={method.id}
                className={cn(
                  'flex min-h-14 min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-input border p-3',
                  'transition-colors duration-fast focus-within:ring-2 focus-within:ring-accent-ink',
                  selected
                    ? 'border-accent/60 bg-accent/10'
                    : 'border-transparent bg-inset hover:border-hairline hover:bg-wash',
                )}
              >
                <input type="radio" value={method.id} className="sr-only" {...register('method_id')} />
                <span
                  aria-hidden
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-chip',
                    selected ? 'bg-accent/16 text-accent-ink' : 'bg-surface-3 text-ink-mute',
                  )}
                >
                  <Smartphone size={17} strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-soft">
                  {method.name}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border',
                    selected ? 'border-accent bg-accent text-on-accent' : 'border-surface-3 bg-transparent',
                  )}
                >
                  {selected ? <Check size={13} strokeWidth={2.5} /> : null}
                </span>
              </label>
            )
          })}
          {errors.method_id ? (
            <p role="alert" className="text-[13px] text-danger">
              {errors.method_id.message}
            </p>
          ) : null}
        </div>
      </fieldset>

      <section className="flex flex-col gap-3 border-b border-hairline-soft pb-6">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="amount" className="text-[14px] font-semibold text-ink-soft">
            Amount
          </label>
          <span className="text-[11.5px] text-ink-mute">
            {formatMoney(money(limits.min_minor, currency))}–{formatMoney(money(limits.max_minor, currency))}
          </span>
        </div>
        <div className="flex min-h-14 items-center gap-2.5 rounded-input bg-inset px-3.5 focus-within:bg-wash">
          <span className="font-mono text-[20px] text-ink-mute">{currencySymbol(currency)}</span>
          <input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={errors.amount ? true : undefined}
            className="min-w-0 flex-1 bg-transparent text-[22px] font-medium text-ink tnum focus:outline-none"
            {...register('amount')}
          />
          <span className="font-mono text-[11px] text-ink-mute">{currency}</span>
        </div>
        {errors.amount ? (
          <p role="alert" className="text-[12.5px] text-danger">
            {errors.amount.message}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <Field label="Account name" htmlFor="account_name" error={errors.account_name?.message}>
          <Input id="account_name" autoComplete="name" {...register('account_name')} />
        </Field>
        <Field label="Account number" htmlFor="account_number" error={errors.account_number?.message}>
          <Input
            id="account_number"
            inputMode="tel"
            autoComplete="off"
            className="font-mono"
            {...register('account_number')}
          />
        </Field>
      </section>

      <div className="flex gap-2.5 rounded-input bg-inset p-3 text-[12px] leading-relaxed text-ink-mute">
        <Clock3 aria-hidden className="mt-0.5 shrink-0" size={15} strokeWidth={1.6} />
        <p>The amount leaves your balance now and is paid out after review. If it’s rejected, it comes back.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        {submitError ? (
          <p role="alert" className="text-[13px] text-danger">
            {submitError}
          </p>
        ) : null}
        <Button type="submit" fullWidth disabled={submitWithdrawal.isPending}>
          {submitWithdrawal.isPending ? 'Submitting…' : 'Request withdrawal'}
        </Button>
      </div>
    </form>
  )
}

function CashOutSkeleton() {
  return (
    <div role="status" aria-label="Loading cash out" className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 shrink-0" />
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="flex flex-col gap-6 rounded-card glass-panel p-4 sm:p-5">
        <Skeleton className="h-14 bg-surface-2" />
        <Skeleton className="h-14 bg-surface-2" />
        <Skeleton className="h-24 bg-surface-2" />
        <Skeleton className="h-11 bg-surface-2" />
      </div>
    </div>
  )
}
