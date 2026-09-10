import { Download } from 'lucide-react'
import { useState } from 'react'

import type { Transaction } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SegmentedTrack } from '@/components/ui/Tabs'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useTransactions, type HistoryKind } from '@/features/wallet'
import { formatDateTime, formatRelative } from '@/lib/format'
import { money } from '@/lib/money'

export function AdminTransactionsPage() {
  const [kind, setKind] = useState<HistoryKind>('all')
  const [page, setPage] = useState(1)
  const query = useTransactions({ kind, days: 90, page })

  const result = query.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Transactions"
        meta="Every money movement on the platform, newest first. Filters and range apply to the export."
        actions={
          <Button variant="secondary" size="sm">
            <Download aria-hidden size={15} strokeWidth={1.5} />
            Export CSV
          </Button>
        }
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
            <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
              <span className="font-mono text-[12px] text-ink-mute">
                {(result.page - 1) * result.size + 1}–
                {Math.min(result.page * result.size, result.total)} of {result.total}
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={result.page === 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={result.page >= result.pages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
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
