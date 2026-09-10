import { useState } from 'react'

import type { AdminDeposit } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SegmentedTrack } from '@/components/ui/Tabs'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAllDeposits } from '@/features/admin'
import { formatDateTime, formatDuration } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'

import { DepositReviewDrawer } from './DepositReviewDrawer'

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

export function AdminDepositsPage() {
  const depositsQuery = useAllDeposits()
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [reviewing, setReviewing] = useState<AdminDeposit | null>(null)

  const all = depositsQuery.data ?? []
  const rows =
    status === 'all'
      ? all
      : all
          .filter((deposit) => deposit.status === status)
          .sort((a, b) =>
            status === 'pending'
              ? Date.parse(a.created_at) - Date.parse(b.created_at)
              : Date.parse(b.created_at) - Date.parse(a.created_at),
          )

  const counts = {
    pending: all.filter((deposit) => deposit.status === 'pending').length,
    approved: all.filter((deposit) => deposit.status === 'approved').length,
    rejected: all.filter((deposit) => deposit.status === 'rejected').length,
    all: all.length,
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Deposits"
        meta="Oldest first while pending — the queue is worked from the top, never the newest."
      />

      <SegmentedTrack
        items={[
          { id: 'pending' as const, label: 'Pending', count: counts.pending },
          { id: 'approved' as const, label: 'Approved', count: counts.approved },
          { id: 'rejected' as const, label: 'Rejected', count: counts.rejected },
          { id: 'all' as const, label: 'All', count: counts.all },
        ]}
        value={status}
        onChange={setStatus}
        label="Filter deposits by status"
      />

      {depositsQuery.isPending ? (
        <SkeletonRows count={6} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing here" description="No request has this status right now." />
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
              leading={<span aria-hidden className="size-9 shrink-0 rounded-full bg-line" />}
              value={
                <span className="font-mono text-sm font-semibold tnum">
                  {formatMoney(money(row.amount_minor, row.currency), { decimals: 'trim' })}
                </span>
              }
              aside={<StatusBadge status={row.status} />}
              actions={
                row.status === 'pending' ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setReviewing(row)}>
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => setReviewing(row)}>
                      Review
                    </Button>
                  </>
                ) : undefined
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
          {row.status === 'pending'
            ? `waiting ${formatDuration(row.created_at)}`
            : formatDateTime(row.created_at)}
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
      cell: (row) =>
        row.status === 'pending' ? (
          <Button size="sm" onClick={() => onReview(row)}>
            Review
          </Button>
        ) : (
          <span className="text-[12.5px] text-ink-mute">Closed</span>
        ),
    },
  ]
}
