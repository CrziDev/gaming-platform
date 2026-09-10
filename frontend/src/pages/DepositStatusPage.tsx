import { Check, ChevronLeft, Clock, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import type { DepositStatus } from '@/api/types'
import { Button, buttonStyles } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { useCancelDeposit, useDeposit } from '@/features/wallet'
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
    frame: 'border-warning/35 bg-warning/6',
    ring: 'border-warning/35 bg-warning/14 text-warning',
  },
  approved: {
    icon: Check,
    heading: 'Approved',
    body: 'The funds are in your wallet and the request has moved into your ledger as approved.',
    frame: 'border-success/35 bg-success/6',
    ring: 'border-success/35 bg-success/14 text-success',
  },
  rejected: {
    icon: X,
    heading: 'Rejected',
    body: 'No funds moved. The reason below comes from the operator who reviewed the request.',
    frame: 'border-danger/35 bg-danger/6',
    ring: 'border-danger/35 bg-danger/14 text-danger',
  },
}

export function DepositStatusPage() {
  const { id = '' } = useParams()
  const depositQuery = useDeposit(id)
  const cancelDeposit = useCancelDeposit()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  if (depositQuery.isPending) {
    return <Skeleton className="mx-auto h-96 w-full max-w-md rounded-sheet" />
  }

  const deposit = depositQuery.data
  if (!deposit) {
    return (
      <EmptyState
        title="Request not found"
        description="This deposit request is no longer on your account."
        action={
          <Link to={paths.wallet} className="text-accent hover:underline">
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
          className="flex size-11 items-center justify-center rounded-input border border-line-strong bg-surface-2 text-ink-mute hover:text-ink"
        >
          <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
        </Link>
        <h1 className="font-display text-lg font-semibold text-ink">Request {deposit.reference}</h1>
      </header>

      <section
        className={cn('flex flex-col items-center gap-3 rounded-sheet border p-6 text-center', state.frame)}
      >
        <span className={cn('flex size-14 items-center justify-center rounded-full border', state.ring)}>
          <Icon aria-hidden size={24} strokeWidth={1.5} />
        </span>
        <h2 className="font-display text-xl font-semibold text-ink">{state.heading}</h2>
        <span className="font-mono text-[30px] font-semibold tnum">
          {formatMoney(money(deposit.amount_minor, deposit.currency))}
        </span>
        <p className="max-w-[34ch] text-[13px] leading-relaxed text-ink-mute text-pretty">{state.body}</p>
        {deposit.reason ? (
          <p className="rounded-input border border-line bg-base px-3.5 py-2.5 text-[13px] text-ink-soft">
            {deposit.reason}
          </p>
        ) : null}
      </section>

      <dl className="flex flex-col gap-2.5 rounded-card border border-line bg-panel p-4 text-[13.5px]">
        <Row label="Method">{deposit.method_name}</Row>
        <Row label="Reference">
          <span className="font-mono">{deposit.reference}</span>
        </Row>
        <Row label="Submitted">{formatDateTime(deposit.created_at)}</Row>
        {deposit.reviewed_at ? <Row label="Reviewed">{formatDateTime(deposit.reviewed_at)}</Row> : null}
        <Row label="Proof">
          <button type="button" className="text-accent hover:underline">
            View upload
          </button>
        </Row>
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
          <Button variant="ghost" fullWidth onClick={() => setConfirming(true)}>
            Cancel request
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Cancel this deposit request?"
        description="The request is withdrawn and no funds move."
        confirmLabel="Cancel request"
        cancelLabel="Keep it open"
        tone="destructive"
        pending={cancelDeposit.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await cancelDeposit.mutateAsync(deposit.id)
          setConfirming(false)
          await navigate(paths.wallet, { replace: true })
        }}
      />
    </div>
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
