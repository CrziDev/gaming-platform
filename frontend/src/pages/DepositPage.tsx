import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { FileDrop } from '@/components/ui/FileDrop'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { depositSchema, type DepositInput } from '@/features/wallet/schemas'
import { useToast } from '@/components/ui/Toast'
import { useActiveWallet, usePaymentMethods, useSubmitDeposit } from '@/features/wallet'
import { formatMoney, money, parseMoneyInput } from '@/lib/money'
import { paths } from '@/routes/paths'

const quickAmounts = [50_000, 100_000, 250_000, 500_000]

export function DepositPage() {
  const methodsQuery = usePaymentMethods()
  const walletQuery = useActiveWallet()
  const submitDeposit = useSubmitDeposit()
  const navigate = useNavigate()
  const toast = useToast()
  const [proof, setProof] = useState<File | null>(null)
  const [proofError, setProofError] = useState<string | undefined>(undefined)

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<DepositInput>({
    resolver: zodResolver(depositSchema),
    defaultValues: { method_id: '', amount: '1000', reference: '' },
  })

  const methods = methodsQuery.data ?? []
  const selectedMethod = useWatch({ control, name: 'method_id' })
  const amount = useWatch({ control, name: 'amount' })
  const currency = walletQuery.data?.currency ?? 'PHP'
  const soleMethod = methods.length === 1 ? methods[0] : undefined

  useEffect(() => {
    if (soleMethod && selectedMethod === '') {
      setValue('method_id', soleMethod.id)
    }
  }, [soleMethod, selectedMethod, setValue])

  const onSubmit = handleSubmit(async (values) => {
    if (!proof) {
      setProofError('Upload a screenshot of your payment')
      return
    }
    setProofError(undefined)

    const created = await submitDeposit.mutateAsync({
      method_id: values.method_id,
      amount_minor: parseMoneyInput(values.amount, currency) ?? 0,
      reference: values.reference,
      currency,
    })

    toast.push(
      `Request ${created.reference} sent for review. Funds appear once an admin approves.`,
      'success',
    )
    await navigate(paths.depositStatus(created.id), { replace: true })
  })

  if (methodsQuery.isPending) {
    return <Skeleton className="h-96 rounded-sheet" />
  }

  if (methods.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface-1 p-6 text-sm text-ink-mute">
        Deposits are paused while payment methods are being updated. Nothing is wrong with your
        account.
      </p>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link
          to={paths.wallet}
          aria-label="Back to wallet"
          className="flex size-11 items-center justify-center rounded-input border border-line-strong bg-surface-2 text-ink-mute hover:text-ink"
        >
          <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink">Deposit</h1>
        {walletQuery.data ? (
          <span className="ml-auto rounded-full border border-line-strong bg-surface-2 px-3 py-1.5 font-mono text-[12.5px] font-semibold tnum">
            {formatMoney(money(walletQuery.data.balance_minor, currency), { decimals: 'trim' })}
          </span>
        ) : null}
      </header>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-7">
        <section className="flex flex-col gap-3">
          <span className="label-mono text-ink-mute">1 · Payment method</span>

          {soleMethod ? (
            <div className="flex items-center gap-3 rounded-input border border-line bg-surface-1 p-3.5">
              <span aria-hidden className="size-9 rounded-chip bg-line" />
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-ink">{soleMethod.name}</span>
                <span className="text-[11.5px] text-ink-mute">{soleMethod.description}</span>
              </span>
            </div>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Payment method</legend>
              {methods.map((method) => (
                <label
                  key={method.id}
                  className={cn(
                    'flex min-h-14 cursor-pointer items-center gap-3 rounded-input border p-3.5',
                    'transition-colors duration-[120ms]',
                    selectedMethod === method.id
                      ? 'border-accent bg-accent/8'
                      : 'border-line bg-surface-1 hover:border-line-strong',
                  )}
                >
                  <input type="radio" value={method.id} className="sr-only" {...register('method_id')} />
                  <span aria-hidden className="size-9 rounded-chip bg-line" />
                  <span className="flex flex-1 flex-col">
                    <span className="text-sm font-semibold text-ink">{method.name}</span>
                    <span className="text-[11.5px] text-ink-mute">{method.description}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'size-5 rounded-full border',
                      selectedMethod === method.id
                        ? 'border-accent bg-accent'
                        : 'border-line-strong',
                    )}
                  />
                </label>
              ))}
              {errors.method_id ? (
                <p role="alert" className="text-[13px] text-danger">
                  {errors.method_id.message}
                </p>
              ) : null}
            </fieldset>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <span className="label-mono text-ink-mute">2 · Amount</span>

          <Field label="Amount" htmlFor="amount" error={errors.amount?.message}>
            <div className="flex min-h-15 items-center gap-2.5 rounded-input border border-line-strong bg-panel px-4">
              <span className="font-mono text-xl text-ink-mute">₱</span>
              <input
                id="amount"
                inputMode="decimal"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent font-mono text-2xl font-semibold tnum focus:outline-none"
                {...register('amount')}
              />
              <span className="font-mono text-[11px] text-ink-mute">{currency}</span>
            </div>
          </Field>

          <div className="grid grid-cols-4 gap-2">
            {quickAmounts.map((value) => {
              const label = formatMoney(money(value, currency), { symbol: false, decimals: 'trim' })
              const active = parseMoneyInput(amount ?? '', currency) === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('amount', label.replace(/,/g, ''), { shouldValidate: true })}
                  className={cn(
                    'min-h-11 rounded-full border font-mono text-[12.5px] transition-colors duration-[120ms]',
                    active
                      ? 'border-accent bg-accent font-semibold text-on-accent'
                      : 'border-line-strong bg-surface-2 text-ink-mute hover:text-ink',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <p className="text-[12px] text-ink-mute">
            Min {formatMoney(money(10_000, currency))} · max {formatMoney(money(5_000_000, currency))}{' '}
            per request.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <span className="label-mono text-ink-mute">3 · Reference number</span>
          <Field label="Reference" htmlFor="reference" error={errors.reference?.message}>
            <Input
              id="reference"
              autoComplete="off"
              placeholder="Transaction ref from your app"
              className="font-mono"
              {...register('reference')}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-3">
          <span className="label-mono text-ink-mute">4 · Proof of payment</span>
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

        <div className="flex flex-col gap-2.5">
          <Button type="submit" fullWidth disabled={submitDeposit.isPending}>
            {submitDeposit.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
          <p className="text-center text-[12px] leading-relaxed text-ink-mute">
            Funds appear only after an admin approves. Typically under 15 minutes.
          </p>
        </div>
      </form>
    </div>
  )
}
