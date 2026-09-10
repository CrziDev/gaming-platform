import { PageHeading } from '@/components/admin/PageHeading'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { useAuditEntries } from '@/features/admin'
import { formatDateTime, formatRelative } from '@/lib/format'

export function AdminAuditPage() {
  const auditQuery = useAuditEntries()

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Audit logs"
        meta="Append-only. Every money and configuration action, attributed to the operator who took it."
      />

      {auditQuery.isPending ? (
        <SkeletonRows count={8} />
      ) : (
        <RecordTable
          label="Audit log"
          rows={auditQuery.data ?? []}
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
              cell: (row) => <span className="text-[13.5px] font-semibold">{row.operator}</span>,
            },
            {
              key: 'action',
              header: 'Action',
              width: '180px',
              cell: (row) => <span className="font-mono text-[12.5px] text-accent">{row.action}</span>,
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
        />
      )}
    </div>
  )
}
