import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { ActiveRtp } from '@/components/admin/ActiveRtp'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAdminGames } from '@/features/admin'
import { formatCount, formatPercent } from '@/lib/format'
import { adminPaths } from '@/routes/paths'

import { GameFormDialog } from './GameFormDialog'

export function AdminGamesPage() {
  const gamesQuery = useAdminGames()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const newGame = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <Plus aria-hidden size={15} strokeWidth={2} />
      New game
    </Button>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          title="Games"
          meta="Every game in every status. Only an active game reaches the player catalogue."
        />
        {newGame}
      </div>

      {gamesQuery.isPending ? (
        <SkeletonRows count={3} />
      ) : gamesQuery.isError ? (
        <ErrorState
          title="Games unavailable"
          message="The catalogue could not be loaded."
          onRetry={() => void gamesQuery.refetch()}
        />
      ) : gamesQuery.data.length === 0 ? (
        <EmptyState
          title="No games configured"
          description="Add the first title to start the catalogue. It stays a draft until you activate it."
          action={newGame}
        />
      ) : (
        <RecordTable
          label="Games"
          rows={gamesQuery.data}
          rowKey={(row) => row.id}
          onRowClick={(row) => void navigate(adminPaths.game(row.id))}
          columns={[
            {
              key: 'game',
              header: 'Game',
              cell: (row) => (
                <span className="flex flex-col">
                  <span className="text-[13.5px] font-medium text-ink-soft">{row.name}</span>
                  <span className="font-mono text-[11px] text-ink-mute">{row.slug}</span>
                </span>
              ),
            },
            { key: 'category', header: 'Category', cell: (row) => row.category_name },
            {
              key: 'integration',
              header: 'Integration',
              cell: (row) => <span className="text-[13px] text-ink-mute">{row.integration.replace('_', ' ')}</span>,
            },
            {
              key: 'rounds',
              header: 'Rounds 30d',
              align: 'right',
              cell: (row) => (
                <span className="font-mono text-sm tnum text-ink-mute">{formatCount(row.rounds_30d)}</span>
              ),
            },
            {
              key: 'rtp',
              header: 'Active RTP',
              align: 'right',
              width: '130px',
              cell: (row) => <ActiveRtp basisPoints={row.active_rtp_basis_points} />,
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
              meta={`${row.category_name} · ${row.active_rtp_basis_points === null ? 'no active profile' : formatPercent(row.active_rtp_basis_points)}`}
              aside={<StatusBadge status={row.status} />}
            />
          )}
        />
      )}

      <GameFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(game) => void navigate(adminPaths.game(game.id))}
      />
    </div>
  )
}
