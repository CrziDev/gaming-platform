import { useState } from 'react'

import { ApiError } from '@/api/client'
import type { AdminWithdrawal } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useReviewWithdrawal, type WithdrawalReview } from '@/features/admin'
import { formatDuration } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'

const rejectionReasons = [
  'Account name does not match',
  'Account number is invalid',
  'Payout method unavailable',
] as const

type WithdrawalReviewModalProps = {
  withdrawal: AdminWithdrawal | null
  onClose: () => void
}

export function WithdrawalReviewModal({ withdrawal, onClose }: WithdrawalReviewModalProps) {
  if (!withdrawal) {
    return null
  }

  return <ReviewForm key={withdrawal.id} withdrawal={withdrawal} onClose={onClose} />
}

function ReviewForm({ withdrawal, onClose }: { withdrawal: AdminWithdrawal; onClose: () => void }) {
  const review = useReviewWithdrawal()
  const toast = useToast()
  const [payoutReference, setPayoutReference] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const amount = formatMoney(money(withdrawal.amount_minor, withdrawal.currency))

  const submit = async (input: WithdrawalReview) => {
    setError(undefined)
    try {
      await review.mutateAsync(input)
      onClose()
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'WITHDRAWAL_ALREADY_REVIEWED') {
        toast.push('This request is no longer pending.')
        onClose()
        return
      }
      if (failure instanceof ApiError) {
        const field = Object.values(failure.fields)[0]
        setError(field ?? failure.message)
        return
      }
      setError('The review could not be sent. Check your connection and try again.')
    }
  }

  const approve = async () => {
    if (payoutReference.trim() === '') {
      setError('Enter the reference of the transfer you sent.')
      return
    }
    await submit({ id: withdrawal.id, action: 'approve', payout_reference: payoutReference.trim() })
  }

  const reject = async () => {
    if (reason === '') {
      setError('Select a reason. The player will see it.')
      return
    }
    await submit({ id: withdrawal.id, action: 'reject', reason })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Withdrawal ${amount}`}
      description={`${withdrawal.display_name || withdrawal.user_email} · waiting ${formatDuration(withdrawal.created_at)}`}
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
              Mark paid
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="flex flex-col gap-2.5 text-[13.5px]">
          <Row label="Amount">
            <span className="font-medium tnum">{amount}</span>
          </Row>
          <Row label="Method">{withdrawal.method_name}</Row>
          <Row label="Account name">{withdrawal.account_name}</Row>
          <Row label="Account number">
            <span className="font-mono">{withdrawal.account_number}</span>
          </Row>
          <Row label="Player">{withdrawal.user_email}</Row>
        </dl>

        <Field label="Payout reference" htmlFor="payout-reference">
          <Input
            id="payout-reference"
            autoComplete="off"
            className="font-mono"
            value={payoutReference}
            onChange={(event) => setPayoutReference(event.target.value)}
          />
        </Field>

        <Field label="Rejection reason (shown to the player)" htmlFor="rejection-reason">
          <Select id="rejection-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="">Select a reason</option>
            {rejectionReasons.map((option) => (
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
      <dd className="text-right text-ink-soft">{children}</dd>
    </div>
  )
}
