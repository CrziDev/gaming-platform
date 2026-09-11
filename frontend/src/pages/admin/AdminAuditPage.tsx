import { useState } from 'react'

import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useAuditEntries } from '@/features/admin'
import { formatDateTime, formatRelative } from '@/lib/format'

export function AdminAuditPage() {
  const [page, setPage] = useState(1)
  const auditQuery = useAuditEntries(page)
  const result = auditQuery.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Audit logs"
        meta="Append-only. Every money and configuration action, attributed to the operator who took it."
      />

      {auditQuery.isPending ? (
        <SkeletonRows count={8} />
      ) : auditQuery.isError ? (
        <ErrorState
          title="Audit log unavailable"
          message="The audit entries could not be loaded."
          onRetry={() => void auditQuery.refetch()}
        />
      ) : !result || result.rows.length === 0 ? (
        <EmptyState title="No audit entries" description="No operator action has been recorded yet." />
      ) : (
        <RecordTable
          label="Audit log"
          rows={result.rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'when',
              header: 'When',
              width: '190px',
              cell: (row) => (
                <span className="font-mono text-[12.5px] text-ink-mute">
                  {formatDateTime(row.created_at)}
                </span>
              ),
            },
            {
              key: 'operator',
              header: 'Operator',
              width: '140px',
              cell: (row) => <span className="text-[13.5px] font-medium text-ink-soft">{row.operator}</span>,
            },
            {
              key: 'action',
              header: 'Action',
              width: '180px',
              cell: (row) => <span className="font-mono text-[12.5px] text-accent-ink">{row.action}</span>,
            },
            {
              key: 'entity',
              header: 'Entity',
              width: '140px',
              cell: (row) => <span className="font-mono text-[12.5px]">{row.entity}</span>,
            },
            { key: 'detail', header: 'Detail', cell: (row) => row.detail },
          ]}
          renderCard={(row) => (
            <RecordCard
              title={row.detail}
              meta={`${row.operator} · ${row.action} · ${formatRelative(row.created_at)}`}
            />
          )}
          footer={
            <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
              <span className="font-mono text-[12px] text-ink-mute">
                Page {result.page} of {result.pages} · {result.total} entries
              </span>
              <span className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={result.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
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
              </span>
            </nav>
          }
        />
      )}
    </div>
  )
}
