import { useState } from 'react'

import type { AdminDeposit } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { adminDepositProofUrl, reasonOptions, useReviewDeposit } from '@/features/admin'
import { formatDuration } from '@/lib/format'
import { currencySymbol, formatMoney, formatMoneyInput, money, parseMoneyInput } from '@/lib/money'

type DepositReviewDrawerProps = {
  deposit: AdminDeposit | null
  onClose: () => void
}

export function DepositReviewDrawer({ deposit, onClose }: DepositReviewDrawerProps) {
  if (!deposit) {
    return null
  }

  return <ReviewForm key={deposit.id} deposit={deposit} onClose={onClose} />
}

function ReviewForm({ deposit, onClose }: { deposit: AdminDeposit; onClose: () => void }) {
  const review = useReviewDeposit()
  const [amount, setAmount] = useState(() =>
    formatMoneyInput(money(deposit.amount_minor, deposit.currency)),
  )
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  const creditMinor = parseMoneyInput(amount, deposit.currency)
  const edited = creditMinor !== deposit.amount_minor

  const approve = async () => {
    if (creditMinor === null || creditMinor <= 0) {
      setError('Enter the amount the proof shows')
      return
    }
    if (edited && reason.trim() === '') {
      setError('An edited amount needs a note')
      return
    }
    await review.mutateAsync({
      id: deposit.id,
      action: 'approve',
      amount_minor: creditMinor,
      ...(edited ? { reason } : {}),
    })
    onClose()
  }

  const reject = async () => {
    if (reason.trim() === '') {
      setError('A rejection needs a reason — the player sees it verbatim')
      return
    }
    await review.mutateAsync({ id: deposit.id, action: 'reject', reason })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Request ${deposit.reference}`}
      description={`${deposit.username} · waiting ${formatDuration(deposit.created_at)}`}
      footer={
        <div className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="destructive" disabled={review.isPending} onClick={() => void reject()}>
              Reject
            </Button>
            <Button disabled={review.isPending} onClick={() => void approve()}>
              Approve {creditMinor === null ? '' : formatMoney(money(creditMinor, deposit.currency))}
            </Button>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-mute">
            Rejecting requires a reason, shown to the player verbatim. Approving with an edited amount
            requires a note. Both write to the audit log.
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <a
          href={adminDepositProofUrl(deposit.id)}
          target="_blank"
          rel="noreferrer"
          className="flex h-48 items-center justify-center rounded-input font-mono text-[11px] text-accent hover:bg-accent/6"
        >
          Open proof of payment
        </a>

        <dl className="flex flex-col gap-2.5 text-[13.5px]">
          <Row label="Amount claimed">
            <span className="font-mono font-semibold tnum">
              {formatMoney(money(deposit.amount_minor, deposit.currency))}
            </span>
          </Row>
          <Row label="Reference">
            <span className="font-mono">{deposit.reference}</span>
          </Row>
          <Row label="Method">{deposit.method_name}</Row>
          {deposit.approved_count !== undefined && deposit.rejected_count !== undefined ? (
            <Row label="Player history">
              {deposit.approved_count} approved · {deposit.rejected_count} rejected
            </Row>
          ) : null}
        </dl>

        <Field label="Credit amount — must match the proof" htmlFor="credit-amount">
          <div className="flex min-h-12 items-center gap-2.5 rounded-input bg-base px-3.5">
            <span className="font-mono text-ink-mute">{currencySymbol(deposit.currency)}</span>
            <input
              id="credit-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="min-w-0 flex-1 bg-transparent font-mono text-[17px] font-semibold tnum focus:outline-none"
            />
          </div>
        </Field>

        <Field
          label={edited ? 'Note — required for an edited amount' : 'Reason — required to reject'}
          htmlFor="review-reason"
        >
          <Select id="review-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="">Select or type a reason</option>
            <option value="Proof unreadable">Proof unreadable</option>
            <option value="Reference not found">Reference not found</option>
            <option value="Amount does not match proof">Amount does not match proof</option>
            {reasonOptions().map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-mute">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  )
}
