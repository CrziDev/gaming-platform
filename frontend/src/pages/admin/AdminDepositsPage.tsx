import { useState } from 'react'

import type { AdminDeposit } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useDepositQueue } from '@/features/admin'
import { formatDuration } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'

import { DepositReviewDrawer } from './DepositReviewDrawer'

export function AdminDepositsPage() {
  const depositsQuery = useDepositQueue()
  const [reviewing, setReviewing] = useState<AdminDeposit | null>(null)

  const rows = depositsQuery.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Deposits"
        meta="Oldest first while pending — the queue is worked from the top, never the newest."
      />

      {depositsQuery.isPending ? (
        <SkeletonRows count={6} />
      ) : depositsQuery.isError ? (
        <ErrorState
          title="Deposit queue unavailable"
          message="Pending requests could not be loaded."
          onRetry={() => void depositsQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title="Queue clear" description="There are no pending deposit requests." />
      ) : (
        <RecordTable
          label="Deposit requests"
          columns={columns(setReviewing)}
          rows={rows}
          rowKey={(row) => row.id}
          renderCard={(row) => (
            <RecordCard
              title={row.username}
              meta={`${row.reference} · ${row.method_name}`}
              leading={<span aria-hidden className="size-9 shrink-0 rounded-full bg-surface-3" />}
              value={
                <span className="font-mono text-sm font-semibold tnum">
                  {formatMoney(money(row.amount_minor, row.currency), { decimals: 'trim' })}
                </span>
              }
              aside={<StatusBadge status={row.status} />}
              actions={
                <>
                  <Button variant="secondary" size="sm" onClick={() => setReviewing(row)}>
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => setReviewing(row)}>
                    Review
                  </Button>
                </>
              }
            />
          )}
        />
      )}

      <DepositReviewDrawer deposit={reviewing} onClose={() => setReviewing(null)} />
    </div>
  )
}

function columns(onReview: (deposit: AdminDeposit) => void): Column<AdminDeposit>[] {
  return [
    {
      key: 'player',
      header: 'Player',
      cell: (row) => <span className="text-[13.5px] font-semibold">{row.username}</span>,
    },
    {
      key: 'reference',
      header: 'Ref · method',
      cell: (row) => (
        <span className="flex flex-col">
          <span className="font-mono text-[12.5px]">{row.reference}</span>
          <span className="text-[11.5px] text-ink-mute">{row.method_name}</span>
        </span>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      width: '190px',
      cell: (row) => (
        <span className="text-[13px] text-ink-mute">
          waiting {formatDuration(row.created_at)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', width: '130px', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      width: '140px',
      cell: (row) => (
        <span className="font-mono text-sm font-semibold tnum">
          {formatMoney(money(row.amount_minor, row.currency))}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      width: '120px',
      cell: (row) => (
        <Button size="sm" onClick={() => onReview(row)}>
          Review
        </Button>
      ),
    },
  ]
}
