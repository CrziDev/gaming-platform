import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ChevronLeft, Clock3, Smartphone } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'

import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { FileDrop } from '@/components/ui/FileDrop'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { cn } from '@/lib/cn'
import { useToast } from '@/components/ui/Toast'
import { createUUID } from '@/lib/uuid'
import {
  createDepositSchema,
  fallbackDepositLimits,
  useActiveWallet,
  useDepositLimits,
  usePaymentMethods,
  useSubmitDeposit,
  type DepositInput,
} from '@/features/wallet'
import { currencySymbol, formatMoney, money, parseMoneyInput } from '@/lib/money'
import { paths } from '@/routes/paths'

// The server names inputs by the wire field; the form names them by what the
// player typed.
const serverFields: Record<string, keyof DepositInput> = {
  method_id: 'method_id',
  amount_minor: 'amount',
  reference: 'reference',
}

export function DepositPage() {
  const methodsQuery = usePaymentMethods()
  const walletQuery = useActiveWallet()
  const limitsQuery = useDepositLimits()
  const submitDeposit = useSubmitDeposit()
  const navigate = useNavigate()
  const toast = useToast()
  const [proof, setProof] = useState<File | null>(null)
  const [proofError, setProofError] = useState<string | undefined>(undefined)
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)
  // One key per form, not per click: a retry after a dropped connection must
  // find the original request on the server instead of creating a second one.
  const [idempotencyKey, setIdempotencyKey] = useState(() => createUUID())
  const currency = walletQuery.data?.currency ?? fallbackDepositLimits.currency
  const limits = limitsQuery.data ?? fallbackDepositLimits
  const schema = useMemo(() => createDepositSchema(currency, limits), [currency, limits])

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<DepositInput>({
    resolver: zodResolver(schema),
    defaultValues: { method_id: '', amount: '1000', reference: '' },
  })

  const methods = methodsQuery.data ?? []
  const selectedMethod = useWatch({ control, name: 'method_id' })
  const amount = useWatch({ control, name: 'amount' })
  const soleMethod = methods.length === 1 ? methods[0] : undefined
  const selectedMethodDetails = methods.find((method) => method.id === selectedMethod)
  const quickAmounts = [50_000, 100_000, 250_000, 500_000].filter(
    (value) => value >= limits.min_minor && value <= limits.max_minor,
  )

  useEffect(() => {
    if (soleMethod && selectedMethod === '') {
      setValue('method_id', soleMethod.id)
    }
  }, [soleMethod, selectedMethod, setValue])

  const onSubmit = handleSubmit(async (values) => {
    if (selectedMethodDetails?.reference_required && values.reference.trim() === '') {
      setError('reference', { message: 'Enter the reference from your payment app' })
      return
    }
    if (!proof) {
      setProofError('Upload a screenshot of your payment')
      return
    }
    setProofError(undefined)
    setSubmitError(undefined)

    let created
    try {
      created = await submitDeposit.mutateAsync({
        method_id: values.method_id,
        amount_minor: parseMoneyInput(values.amount, currency) ?? 0,
        reference: values.reference,
        currency,
        proof,
        idempotency_key: idempotencyKey,
      })
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setSubmitError('The request could not be sent. Check your connection and try again.')
        return
      }
      // The server rejected this submission outright, so the next attempt is a
      // new request and needs its own key.
      setIdempotencyKey(createUUID())
      if (error.status === 413) {
        setProofError('The screenshot is too large. Use an image under 5 MB.')
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
      if (error.fields.proof) {
        setProofError(error.fields.proof)
        placed = true
      }
      if (!placed) {
        setSubmitError(error.message)
      }
      return
    }

    toast.push(
      `Request ${created.reference} submitted. Funds are added once it is approved.`,
      'success',
    )
    await navigate(paths.depositStatus(created.id), { replace: true })
  })

  if (methodsQuery.isPending || walletQuery.isPending || limitsQuery.isPending) {
    return <DepositPageSkeleton />
  }

  if (methodsQuery.isError || walletQuery.isError || limitsQuery.isError) {
    return (
      <ErrorState
        title="Deposits unavailable"
        message="Payment methods and limits could not be loaded."
        onRetry={() => {
          void methodsQuery.refetch()
          void walletQuery.refetch()
          void limitsQuery.refetch()
        }}
      />
    )
  }

  if (methods.length === 0) {
    return (
      <p className="rounded-card glass-panel p-6 text-sm text-ink-mute">
        Deposits are temporarily unavailable. Please try again later.
      </p>
    )
  }

  const parsedAmount = parseMoneyInput(amount ?? '', currency)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex items-start gap-3">
        <Link
          to={paths.wallet}
          aria-label="Back to wallet"
          className="flex size-11 items-center justify-center rounded-input bg-inset text-ink-mute hover:bg-wash hover:text-ink-soft"
        >
          <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
        </Link>
        <div className="flex flex-col gap-0.5 pt-0.5">
          <h1 className="text-[20px] font-bold tracking-[-0.02em] text-ink">Deposit</h1>
          <p className="text-[13px] text-ink-mute">
            Send your payment, then submit the details for approval.
          </p>
        </div>
      </header>

      <form
        onSubmit={onSubmit}
        noValidate
        className="grid min-w-0 items-start gap-5 @rail-wide:grid-cols-[minmax(0,1fr)_18rem]"
      >
        <div className="flex min-w-0 flex-col gap-6 rounded-card glass-panel p-4 sm:p-5">
          <fieldset className="min-w-0 border-b border-hairline-soft pb-6">
            <legend className="text-[14px] font-semibold text-ink-soft">Payment method</legend>
            <p className="mt-0.5 text-[12.5px] text-ink-mute">
              Choose the account you used to send your payment.
            </p>

            <div className="mt-3 flex min-w-0 flex-col gap-2">
              {methods.map((method) => {
                const selected = selectedMethod === method.id
                return (
                  <label
                    key={method.id}
                    className={cn(
                      'flex min-h-18 min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-input border p-3.5',
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
                        'flex size-10 shrink-0 items-center justify-center rounded-chip',
                        selected ? 'bg-accent/16 text-accent-ink' : 'bg-surface-3 text-ink-mute',
                      )}
                    >
                      <Smartphone size={18} strokeWidth={1.6} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
                      <span className="truncate text-[13.5px] font-semibold text-ink-soft">
                        {method.name}
                      </span>
                      <span className="font-mono text-[11.5px] break-words text-ink-soft">
                        Send to {method.pay_to}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border',
                        selected
                          ? 'border-accent bg-accent text-on-accent'
                          : 'border-surface-3 bg-transparent',
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
                {formatMoney(money(limits.min_minor, currency))}–
                {formatMoney(money(limits.max_minor, currency))}
              </span>
            </div>
            <div className="flex min-h-14 items-center gap-2.5 rounded-input bg-inset px-3.5 focus-within:bg-wash">
              <span className="font-mono text-[20px] text-ink-mute">{currencySymbol(currency)}</span>
              <input
                id="amount"
                inputMode="decimal"
                autoComplete="off"
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

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {quickAmounts.map((value) => {
                const label = formatMoney(money(value, currency), { symbol: false, decimals: 'trim' })
                const active = parsedAmount === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setValue('amount', label.replace(/,/g, ''), { shouldValidate: true })
                    }
                    aria-pressed={active}
                    className={cn(
                      'min-h-11 rounded-chip text-[14px] font-medium tnum transition-colors duration-fast lg:min-h-8',
                      active
                        ? 'bg-selected text-ink ring-1 ring-accent-ink/45 ring-inset'
                        : 'bg-inset text-ink-mute hover:bg-wash hover:text-ink-soft',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="flex flex-col gap-3 border-b border-hairline-soft pb-6">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[14px] font-semibold text-ink-soft">
                Reference number{selectedMethodDetails?.reference_required ? '' : ' (optional)'}
              </h2>
              <p className="text-[12.5px] text-ink-mute">
                Use the transaction reference shown in your payment app.
              </p>
            </div>
            <Field label="Reference" htmlFor="reference" error={errors.reference?.message}>
              <Input
                id="reference"
                autoComplete="off"
                placeholder="e.g. 1234 5678 9012"
                className="font-mono"
                {...register('reference')}
              />
            </Field>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-[14px] font-semibold text-ink-soft">Proof of payment</h2>
              <p className="text-[12.5px] text-ink-mute">
                Upload a clear screenshot showing the completed payment.
              </p>
            </div>
            <FileDrop
              label="Upload screenshot"
              hint="PNG or JPG · max 5 MB"
              value={proof}
              onChange={(file) => {
                setProof(file)
                setProofError(undefined)
              }}
              error={proofError}
            />
          </section>
        </div>

        <aside
          aria-labelledby="deposit-summary-heading"
          className="flex min-w-0 flex-col gap-4 rounded-card glass-panel p-4 @rail-wide:sticky @rail-wide:top-3.5"
        >
          <h2 id="deposit-summary-heading" className="text-[14px] font-semibold text-ink-soft">
            Deposit summary
          </h2>
          <dl className="flex flex-col gap-3 text-[12.5px]">
            <SummaryRow label="Method" value={selectedMethodDetails?.name ?? 'Select a method'} />
            <SummaryRow
              label="Amount"
              value={parsedAmount === null ? '—' : formatMoney(money(parsedAmount, currency))}
              emphasis
            />
            <SummaryRow label="Send to" value={selectedMethodDetails?.pay_to ?? '—'} mono />
          </dl>

          <div className="flex gap-2.5 rounded-input bg-inset p-3 text-[12px] leading-relaxed text-ink-mute">
            <Clock3 aria-hidden className="mt-0.5 shrink-0" size={15} strokeWidth={1.6} />
            <p>Funds are added after approval, usually within 15 minutes.</p>
          </div>

          <div className="flex flex-col gap-2.5">
            {submitError ? (
              <p role="alert" className="text-[13px] text-danger">
                {submitError}
              </p>
            ) : null}
            <Button type="submit" fullWidth disabled={submitDeposit.isPending}>
              {submitDeposit.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
            <p className="text-center text-[11.5px] leading-relaxed text-ink-mute">
              Review the details before submitting.
            </p>
          </div>
        </aside>
      </form>
    </div>
  )
}

function DepositPageSkeleton() {
  return (
    <div role="status" aria-label="Loading deposit form" className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-full max-w-72" />
        </div>
      </div>
      <div className="grid items-start gap-5 @rail-wide:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-6 rounded-card glass-panel p-4 sm:p-5">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col gap-3">
              <Skeleton className="h-4 w-32 bg-surface-2" />
              <Skeleton className={cn(index === 0 ? 'h-18' : 'h-12', 'bg-surface-2')} />
              {index === 1 ? <Skeleton className="h-8 w-full bg-surface-2" /> : null}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-card glass-panel p-4">
          <Skeleton className="h-4 w-28 bg-surface-2" />
          <Skeleton className="h-24 bg-surface-2" />
          <Skeleton className="h-11 bg-surface-2" />
        </div>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  emphasis = false,
  mono = false,
}: {
  label: string
  value: string
  emphasis?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline-soft pb-3 last:border-0 last:pb-0">
      <dt className="text-ink-mute">{label}</dt>
      <dd
        className={cn(
          'max-w-[11rem] text-right text-ink-soft',
          emphasis && 'text-[16px] font-semibold text-ink tnum',
          mono && 'font-mono text-[11.5px]',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
