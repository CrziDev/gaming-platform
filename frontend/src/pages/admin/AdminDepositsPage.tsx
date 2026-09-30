import { useState } from 'react'
import { useSearchParams } from 'react-router'

import type { AdminDeposit } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { PageNav } from '@/components/ui/PageNav'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAdminDeposits } from '@/features/admin'
import { formatDuration } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'

import { DepositReviewDrawer } from './DepositReviewDrawer'

export function AdminDepositsPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search')?.trim() ?? ''
  const [pagination, setPagination] = useState({ search, page: 1 })
  const page = pagination.search === search ? pagination.page : 1
  const setPage = (nextPage: number) => setPagination({ search, page: nextPage })
  const depositsQuery = useAdminDeposits({
    page,
    status: search ? 'all' : 'pending',
    ...(search ? { search } : {}),
  })
  const [reviewing, setReviewing] = useState<AdminDeposit | null>(null)

  const result = depositsQuery.data
  const rows = result?.rows ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Deposits"
        meta={search ? 'Console search result across every deposit status.' : 'Pending requests, oldest first.'}
      />

      {search ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-surface-1 px-4 py-3">
          <span className="text-[13px] text-ink-mute">Matching deposit <span className="font-mono text-ink-soft">{search.slice(0, 12)}</span></span>
          <Button variant="secondary" size="sm" onClick={() => { setParams({}); setPage(1) }}>Clear search</Button>
        </div>
      ) : null}

      {depositsQuery.isPending ? (
        <SkeletonRows count={6} />
      ) : depositsQuery.isError ? (
        <ErrorState
          title="Deposit queue unavailable"
          message="Pending requests could not be loaded."
          onRetry={() => void depositsQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={search ? 'Deposit not found' : 'Queue is clear'}
          description={search ? 'The searched payment reference or deposit is unavailable.' : 'No deposits are waiting for review.'}
        />
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
                <span className="text-sm font-medium tnum">
                  {formatMoney(money(row.amount_minor, row.currency), { decimals: 'trim' })}
                </span>
              }
              aside={<StatusBadge status={row.status} />}
              actions={row.status === 'pending' ? (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setReviewing(row)}>
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => setReviewing(row)}>
                    Review
                  </Button>
                </>
              ) : undefined}
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

      <DepositReviewDrawer deposit={reviewing} onClose={() => setReviewing(null)} />
    </div>
  )
}

function columns(onReview: (deposit: AdminDeposit) => void): Column<AdminDeposit>[] {
  return [
    {
      key: 'player',
      header: 'Player',
      cell: (row) => <span className="text-[13.5px] font-medium text-ink-soft">{row.username}</span>,
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
        <span className="text-sm font-medium tnum">
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
        row.status === 'pending' ? <Button size="sm" onClick={() => onReview(row)}>Review</Button> : <span className="text-ink-mute">—</span>
      ),
    },
  ]
}
