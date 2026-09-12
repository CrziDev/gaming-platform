import { useState } from 'react'

import type { Transaction } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { PageNav } from '@/components/ui/PageNav'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SegmentedTrack } from '@/components/ui/Tabs'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAdminTransactions } from '@/features/admin'
import type { HistoryKind } from '@/features/wallet'
import { formatDateTime, formatRelative } from '@/lib/format'
import { money } from '@/lib/money'

export function AdminTransactionsPage() {
  const [kind, setKind] = useState<HistoryKind>('all')
  const [page, setPage] = useState(1)
  const query = useAdminTransactions({ kind, days: 90, page })

  const result = query.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Transactions"
        meta="Every money movement on the platform, newest first, over the last 90 days."
      />

      <SegmentedTrack
        items={[
          { id: 'all' as const, label: 'All' },
          { id: 'deposit' as const, label: 'Deposits' },
          { id: 'rounds' as const, label: 'Rounds' },
          { id: 'adjustment' as const, label: 'Adjustments' },
        ]}
        value={kind}
        onChange={(next) => {
          setKind(next)
          setPage(1)
        }}
        label="Filter transactions by type"
      />

      {query.isPending ? (
        <SkeletonRows count={8} />
      ) : query.isError ? (
        <ErrorState
          title="Transactions unavailable"
          message="The ledger could not be loaded."
          onRetry={() => void query.refetch()}
        />
      ) : !result || result.rows.length === 0 ? (
        <EmptyState title="No transactions" description="Nothing matches this filter." />
      ) : (
        <RecordTable
          label="Platform transactions"
          columns={columns}
          rows={result.rows}
          rowKey={(row) => row.id}
          renderCard={(row) => (
            <RecordCard
              title={row.label}
              meta={`${row.reference} · ${formatRelative(row.created_at)}`}
              value={
                <MoneyDisplay
                  value={money(row.amount_minor, row.currency)}
                  tone="auto"
                  sign="always"
                  className="text-sm"
                />
              }
              aside={<StatusBadge status={row.status} />}
            />
          )}
          footer={
            <PageNav
              page={result.page}
              pages={result.pages}
              size={result.size}
              total={result.total}
              onChange={setPage}
            />
          }
        />
      )}
    </div>
  )
}

const columns: Column<Transaction>[] = [
  {
    key: 'date',
    header: 'Date',
    width: '190px',
    cell: (row) => (
      <span className="font-mono text-[13px] text-ink-mute">{formatDateTime(row.created_at)}</span>
    ),
  },
  { key: 'type', header: 'Type', cell: (row) => row.label },
  {
    key: 'reference',
    header: 'Reference',
    width: '140px',
    cell: (row) => <span className="font-mono text-[13px] text-ink-mute">{row.reference}</span>,
  },
  { key: 'status', header: 'Status', width: '130px', cell: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    width: '160px',
    cell: (row) => (
      <MoneyDisplay value={money(row.amount_minor, row.currency)} tone="auto" sign="always" />
    ),
  },
]
