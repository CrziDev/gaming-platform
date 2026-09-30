import { ChevronLeft, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAdminGame } from '@/features/admin'
import { formatCount, formatDate, formatPercent } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { adminPaths } from '@/routes/paths'

import { GameFormDialog } from './GameFormDialog'

export function AdminGameDetailPage() {
  const { id = '' } = useParams()
  const gameQuery = useAdminGame(id)
  const [editing, setEditing] = useState(false)

  if (gameQuery.isPending) {
    return <SkeletonRows count={5} />
  }
  if (gameQuery.isError) {
    return (
      <ErrorState
        title="Game unavailable"
        message="The game could not be loaded."
        onRetry={() => void gameQuery.refetch()}
      />
    )
  }

  const game = gameQuery.data
  if (!game) {
    return (
      <EmptyState
        title="Game not found"
        action={
          <Link to={adminPaths.games} className="text-accent-ink hover:text-accent-hi">
            Back to games
          </Link>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-ink-mute">
          <Link to={adminPaths.games} className="inline-flex min-h-11 items-center gap-1 hover:text-ink-soft">
            <ChevronLeft aria-hidden size={15} strokeWidth={1.5} />
            Games
          </Link>
          <span aria-hidden>/</span>
          <span className="text-ink-soft">{game.name}</span>
          <StatusBadge status={game.status} className="ml-2" />
        </nav>
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          <Pencil aria-hidden size={14} strokeWidth={1.75} />
          Edit game
        </Button>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 wide:grid-cols-4">
        <StatCard label="RTP" value={game.rtp_basis_points === null ? '—' : formatPercent(game.rtp_basis_points)} />
        <StatCard label="Rounds 30d" value={formatCount(game.rounds_30d)} />
        <StatCard label="Category" value={game.category_name} />
        <StatCard label="Provider" value={game.provider} />
      </div>

      <div className="grid gap-5 wide:grid-cols-2 wide:items-start">
        <Panel title="Configuration" bodyClassName="flex flex-col gap-3 p-5">
          <Row label="Slug">
            <span className="font-mono">{game.slug}</span>
          </Row>
          {(['PHP', 'USD'] as const).map((currency) => {
            const limits = game.wager_limits[currency]
            return (
              <div key={currency} className="flex flex-col gap-2 border-t border-hairline-soft pt-3 first:border-0 first:pt-0">
                <Row label={`${currency} minimum`}>
                  <span className="tnum">{formatMoney(money(limits.min_wager_minor, currency))}</span>
                </Row>
                <Row label={`${currency} maximum`}>
                  <span className="tnum">{formatMoney(money(limits.max_wager_minor, currency))}</span>
                </Row>
                <Row label={`${currency} step`}>
                  <span className="tnum">{formatMoney(money(limits.wager_step_minor, currency))}</span>
                </Row>
              </div>
            )
          })}
          <Row label="Integration">{game.integration.replace('_', ' ')}</Row>
          <Row label="Status">
            <StatusBadge status={game.status} />
          </Row>
          <Row label="Added">{formatDate(game.created_at)}</Row>
          {game.description ? (
            <p className="pt-1 text-[12.5px] leading-relaxed text-ink-mute">{game.description}</p>
          ) : null}
        </Panel>
      </div>

      {game.rtp_options.length > 0 ? (
        <Panel title="RTP" bodyClassName="flex flex-col gap-2.5 p-5">
          <Row label="Playing at">
            <span className="tnum">
              {game.rtp_basis_points === null ? 'not set' : formatPercent(game.rtp_basis_points)}
            </span>
          </Row>
          <Row label="Options">
            <span className="tnum">{game.rtp_options.map((option) => formatPercent(option)).join(' · ')}</span>
          </Row>
          <Link to={adminPaths.rtp} className="pt-1 text-[13px] text-accent-ink hover:text-accent-hi">
            Change on the RTP page →
          </Link>
        </Panel>
      ) : null}

      <GameFormDialog open={editing} game={game} onClose={() => setEditing(false)} />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[13.5px]">
      <span className="text-ink-mute">{label}</span>
      <span className="text-right text-ink-soft">{children}</span>
    </div>
  )
}
