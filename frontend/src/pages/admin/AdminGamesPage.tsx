import { useNavigate } from 'react-router'

import { PageHeading } from '@/components/admin/PageHeading'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAdminGames } from '@/features/admin'
import { formatCount, formatPercent } from '@/lib/format'
import { adminPaths } from '@/routes/paths'

export function AdminGamesPage() {
  const gamesQuery = useAdminGames()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Games"
        meta="Status, integration and the RTP profile currently in force for each game."
      />

      {gamesQuery.isPending ? (
        <SkeletonRows count={3} />
      ) : (
        <RecordTable
          label="Games"
          rows={gamesQuery.data ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => void navigate(adminPaths.game(row.id))}
          columns={[
            {
              key: 'game',
              header: 'Game',
              cell: (row) => (
                <span className="flex flex-col">
                  <span className="text-[13.5px] font-semibold">{row.name}</span>
                  <span className="font-mono text-[11px] text-ink-mute">{row.slug}</span>
                </span>
              ),
            },
            { key: 'category', header: 'Category', cell: (row) => row.category_name },
            {
              key: 'integration',
              header: 'Integration',
              cell: (row) => <span className="text-[13px] text-ink-mute">{row.integration}</span>,
            },
            {
              key: 'rounds',
              header: 'Rounds 30d',
              align: 'right',
              cell: (row) => (
                <span className="font-mono text-sm tnum text-ink-mute">
                  {formatCount(row.rounds_30d)}
                </span>
              ),
            },
            {
              key: 'rtp',
              header: 'Active RTP',
              align: 'right',
              width: '130px',
              cell: (row) => (
                <span
                  className={
                    row.active_rtp_basis_points >= 10_000
                      ? 'font-mono text-sm font-semibold tnum text-danger'
                      : 'font-mono text-sm font-semibold tnum'
                  }
                >
                  {formatPercent(row.active_rtp_basis_points)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              width: '130px',
              cell: (row) => <StatusBadge status={row.status} />,
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              onClick={() => void navigate(adminPaths.game(row.id))}
              title={row.name}
              meta={`${row.category_name} · ${formatPercent(row.active_rtp_basis_points)}`}
              aside={<StatusBadge status={row.status} />}
            />
          )}
        />
      )}
    </div>
  )
}
