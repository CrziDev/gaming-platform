import { useState } from 'react'

import type { AdminWithdrawal } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { PageNav } from '@/components/ui/PageNav'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAdminWithdrawals } from '@/features/admin'
import { formatDuration } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'

import { WithdrawalReviewModal } from './WithdrawalReviewModal'

export function AdminWithdrawalsPage() {
  const [page, setPage] = useState(1)
  const withdrawalsQuery = useAdminWithdrawals({ page, status: 'pending' })
  const [reviewing, setReviewing] = useState<AdminWithdrawal | null>(null)

  const result = withdrawalsQuery.data
  const rows = result?.rows ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Withdrawals" meta="Pending requests, oldest first." />

      {withdrawalsQuery.isPending ? (
        <SkeletonRows count={6} />
      ) : withdrawalsQuery.isError ? (
        <ErrorState
          title="Withdrawal queue unavailable"
          message="Pending requests could not be loaded."
          onRetry={() => void withdrawalsQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState title="Queue is clear" description="No withdrawals are waiting for review." />
      ) : (
        <RecordTable
          label="Withdrawal requests"
          columns={columns(setReviewing)}
          rows={rows}
          rowKey={(row) => row.id}
          renderCard={(row) => (
            <RecordCard
              title={row.display_name || row.user_email}
              meta={`${row.method_name} · ${row.account_number}`}
              leading={<Avatar name={row.display_name || row.user_email} className="size-9 text-[11px]" />}
              value={
                <span className="text-sm font-medium tnum">
                  {formatMoney(money(row.amount_minor, row.currency), { decimals: 'trim' })}
                </span>
              }
              aside={<StatusBadge status={row.status} />}
              onClick={() => setReviewing(row)}
            />
          )}
          footer={
            result ? (
              <PageNav
                page={result.page}
                pages={result.pages}
                size={result.size}
                total={result.total}
                onChange={setPage}
                unit="pending"
              />
            ) : null
          }
        />
      )}

      <WithdrawalReviewModal withdrawal={reviewing} onClose={() => setReviewing(null)} />
    </div>
  )
}

function columns(onReview: (withdrawal: AdminWithdrawal) => void): Column<AdminWithdrawal>[] {
  return [
    {
      key: 'player',
      header: 'Player',
      cell: (row) => (
        <span className="text-[13.5px] font-medium text-ink-soft">{row.display_name || row.user_email}</span>
      ),
    },
    {
      key: 'account',
      header: 'Pay to',
      cell: (row) => (
        <span className="flex flex-col">
          <span className="text-[12.5px] text-ink-soft">{row.account_name}</span>
          <span className="font-mono text-[11.5px] text-ink-mute">
            {row.method_name} · {row.account_number}
          </span>
        </span>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      width: '190px',
      cell: (row) => <span className="text-[13px] text-ink-mute">waiting {formatDuration(row.created_at)}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      width: '140px',
      cell: (row) => (
        <span className="text-sm font-medium tnum">{formatMoney(money(row.amount_minor, row.currency))}</span>
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
