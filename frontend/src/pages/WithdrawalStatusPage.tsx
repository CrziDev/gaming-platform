import { Ban, Check, ChevronLeft, Clock, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { ApiError } from '@/api/client'
import type { WithdrawalStatus } from '@/api/types'
import { Button, buttonStyles } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useCancelWithdrawal, useWithdrawal } from '@/features/wallet'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

const presentation: Record<
  WithdrawalStatus,
  { icon: typeof Clock; heading: string; body: string; ring: string }
> = {
  pending: {
    icon: Clock,
    heading: 'Awaiting review',
    body: "This amount is held from your balance. We'll notify you once it has been paid out.",
    ring: 'bg-warning/14 text-warning',
  },
  approved: {
    icon: Check,
    heading: 'Paid out',
    body: 'The amount has been sent to your account.',
    ring: 'bg-success/14 text-success',
  },
  rejected: {
    icon: X,
    heading: 'Rejected',
    body: 'The amount is back in your wallet.',
    ring: 'bg-danger/14 text-danger',
  },
  cancelled: {
    icon: Ban,
    heading: 'Cancelled',
    body: 'The amount is back in your wallet.',
    ring: 'bg-inset text-ink-mute',
  },
}

export function WithdrawalStatusPage() {
  const { id = '' } = useParams()
  const withdrawalQuery = useWithdrawal(id)
  const cancelWithdrawal = useCancelWithdrawal()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)

  if (withdrawalQuery.isPending) {
    return <Skeleton className="mx-auto h-96 w-full max-w-md rounded-card" />
  }

  if (withdrawalQuery.isError) {
    return (
      <ErrorState
        title="Request unavailable"
        message="This request could not be loaded."
        onRetry={() => void withdrawalQuery.refetch()}
      />
    )
  }

  const withdrawal = withdrawalQuery.data
  if (!withdrawal) {
    return (
      <EmptyState
        title="Request not found"
        action={
          <Link to={paths.wallet} className="text-accent-ink hover:text-accent-hi">
            Back to wallet
          </Link>
        }
      />
    )
  }

  const state = presentation[withdrawal.status]
  const Icon = state.icon

  const confirmCancel = () => {
    cancelWithdrawal.mutate(withdrawal.id, {
      onSuccess: () => toast.push('Withdrawal cancelled. The amount is back in your wallet.', 'success'),
      onError: (error) => {
        toast.push(
          error instanceof ApiError && error.code === 'WITHDRAWAL_ALREADY_REVIEWED'
            ? 'This request has already been reviewed.'
            : 'The request could not be cancelled. Try again.',
          'danger',
        )
      },
      onSettled: () => setConfirming(false),
    })
  }

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
        <h1 className="text-[20px] font-bold tracking-[-0.02em] text-ink">Withdrawal</h1>
      </header>

      <section className="flex flex-col items-center gap-3 rounded-card glass-panel p-6 text-center">
        <span className={cn('flex size-14 items-center justify-center rounded-full', state.ring)}>
          <Icon aria-hidden size={24} strokeWidth={1.5} />
        </span>
        <h2 className="text-[20px] font-bold tracking-[-0.02em] text-ink">{state.heading}</h2>
        <span className="text-[28px] font-medium text-ink tnum">
          {formatMoney(money(withdrawal.amount_minor, withdrawal.currency))}
        </span>
        <p className="max-w-[34ch] text-[13px] leading-relaxed text-ink-mute text-pretty">{state.body}</p>
        {withdrawal.reason ? (
          <p className="rounded-input bg-inset px-3.5 py-2.5 text-[13px] text-ink-soft">{withdrawal.reason}</p>
        ) : null}
      </section>

      <dl className="flex flex-col gap-2.5 rounded-card glass-panel p-4 text-[13.5px]">
        <Row label="Method">{withdrawal.method_name}</Row>
        <Row label="Account name">{withdrawal.account_name}</Row>
        <Row label="Account number">
          <span className="font-mono">{withdrawal.account_number}</span>
        </Row>
        {withdrawal.payout_reference ? (
          <Row label="Payout reference">
            <span className="font-mono">{withdrawal.payout_reference}</span>
          </Row>
        ) : null}
        <Row label="Requested">{formatDateTime(withdrawal.created_at)}</Row>
        {withdrawal.reviewed_at ? <Row label="Reviewed">{formatDateTime(withdrawal.reviewed_at)}</Row> : null}
        {withdrawal.cancelled_at ? <Row label="Cancelled">{formatDateTime(withdrawal.cancelled_at)}</Row> : null}
      </dl>

      <div className="flex flex-col gap-2">
        {withdrawal.status === 'pending' ? (
          <Button variant="secondary" fullWidth onClick={() => setConfirming(true)}>
            Cancel request
          </Button>
        ) : null}
        <Link to={paths.wallet} className={buttonStyles('secondary', 'md', true)}>
          Back to wallet
        </Link>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Cancel this withdrawal?"
        description={`${formatMoney(money(withdrawal.amount_minor, withdrawal.currency))} goes back to your wallet.`}
        confirmLabel="Cancel withdrawal"
        cancelLabel="Keep it"
        tone="destructive"
        pending={cancelWithdrawal.isPending}
        onConfirm={confirmCancel}
        onClose={() => setConfirming(false)}
      />
    </div>
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
