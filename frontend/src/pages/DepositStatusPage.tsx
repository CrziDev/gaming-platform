import { Check, ChevronLeft, Clock, X } from 'lucide-react'
import { Link, useParams } from 'react-router'

import type { DepositStatus } from '@/api/types'
import { buttonStyles } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { useDeposit } from '@/features/wallet'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

const presentation: Record<
  DepositStatus,
  { icon: typeof Clock; heading: string; body: string; frame: string; ring: string }
> = {
  pending: {
    icon: Clock,
    heading: 'Awaiting approval',
    body: "We'll notify you the moment an admin reviews this. You can keep playing with your current balance.",
    frame: 'bg-warning/10',
    ring: 'bg-warning/14 text-warning',
  },
  approved: {
    icon: Check,
    heading: 'Approved',
    body: 'The funds are in your wallet and the request has moved into your ledger as approved.',
    frame: 'bg-success/10',
    ring: 'bg-success/14 text-success',
  },
  rejected: {
    icon: X,
    heading: 'Rejected',
    body: 'No funds moved. The reason below comes from the operator who reviewed the request.',
    frame: 'bg-danger/10',
    ring: 'bg-danger/14 text-danger',
  },
}

export function DepositStatusPage() {
  const { id = '' } = useParams()
  const depositQuery = useDeposit(id)

  if (depositQuery.isPending) {
    return <Skeleton className="mx-auto h-96 w-full max-w-md rounded-card" />
  }

  const deposit = depositQuery.data
  if (!deposit) {
    return (
      <EmptyState
        title="Request not found"
        description="This deposit request is no longer on your account."
        action={
          <Link to={paths.wallet} className="text-accent-ink hover:text-accent-hi">
            Back to wallet
          </Link>
        }
      />
    )
  }

  const state = presentation[deposit.status]
  const Icon = state.icon

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
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Request {deposit.reference}</h1>
      </header>

      <section
        className={cn('flex flex-col items-center gap-3 rounded-card p-6 text-center', state.frame)}
      >
        <span className={cn('flex size-14 items-center justify-center rounded-full', state.ring)}>
          <Icon aria-hidden size={24} strokeWidth={1.5} />
        </span>
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{state.heading}</h2>
        <span className="font-mono text-[28px] font-medium text-ink tnum">
          {formatMoney(money(deposit.amount_minor, deposit.currency))}
        </span>
        <p className="max-w-[34ch] text-[13px] leading-relaxed text-ink-mute text-pretty">{state.body}</p>
        {deposit.reason ? (
          <p className="rounded-input bg-inset px-3.5 focus-within:bg-wash py-2.5 text-[13px] text-ink-soft">
            {deposit.reason}
          </p>
        ) : null}
      </section>

      <dl className="flex flex-col gap-2.5 rounded-card bg-surface-1 p-4 text-[13.5px]">
        <Row label="Method">{deposit.method_name}</Row>
        <Row label="Reference">
          <span className="font-mono">{deposit.reference}</span>
        </Row>
        <Row label="Submitted">{formatDateTime(deposit.created_at)}</Row>
        {deposit.reviewed_at ? <Row label="Reviewed">{formatDateTime(deposit.reviewed_at)}</Row> : null}
        <Row label="Proof">Stored for administrator review</Row>
      </dl>

      <div className="flex flex-col gap-2">
        {deposit.status === 'rejected' ? (
          <Link to={paths.deposit} className={buttonStyles('primary', 'md', true)}>
            Try again
          </Link>
        ) : (
          <Link to={paths.wallet} className={buttonStyles('secondary', 'md', true)}>
            Back to wallet
          </Link>
        )}

        {deposit.status === 'pending' ? (
          <p className="text-center text-[12.5px] leading-relaxed text-ink-mute">
            Submitted requests cannot be cancelled. An administrator must approve or reject this request.
          </p>
        ) : null}
      </div>
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
