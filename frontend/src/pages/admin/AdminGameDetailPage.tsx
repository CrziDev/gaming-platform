import { ChevronLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { Panel } from '@/components/ui/Panel'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAdminGame, useRtpProfiles } from '@/features/admin'
import { formatCount, formatDate, formatPercent } from '@/lib/format'
import { adminPaths } from '@/routes/paths'

export function AdminGameDetailPage() {
  const { id = '' } = useParams()
  const gameQuery = useAdminGame(id)
  const rtpQuery = useRtpProfiles()

  if (gameQuery.isPending) {
    return <SkeletonRows count={5} />
  }

  const game = gameQuery.data
  if (!game) {
    return (
      <EmptyState
        title="Game not found"
        description="This game is not in the catalogue."
        action={
          <Link to={adminPaths.games} className="text-accent hover:underline">
            Back to games
          </Link>
        }
      />
    )
  }

  const profiles = (rtpQuery.data ?? []).filter((profile) => profile.game_id === game.id)

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-ink-mute">
        <Link to={adminPaths.games} className="inline-flex min-h-11 items-center gap-1 hover:text-ink">
          <ChevronLeft aria-hidden size={15} strokeWidth={1.5} />
          Games
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink">{game.name}</span>
        <StatusBadge status={game.status} className="ml-2" />
      </nav>

      <div className="grid gap-3.5 sm:grid-cols-2 wide:grid-cols-4">
        <StatCard label="Active RTP" value={formatPercent(game.active_rtp_basis_points)} />
        <StatCard label="Rounds 30d" value={formatCount(game.rounds_30d)} />
        <StatCard label="Category" value={game.category_name} />
        <StatCard label="Provider" value={game.provider} />
      </div>

      <div className="grid gap-5 wide:grid-cols-2 wide:items-start">
        <Panel title="Configuration" bodyClassName="flex flex-col gap-3 p-5">
          <Row label="Slug">
            <span className="font-mono">{game.slug}</span>
          </Row>
          <Row label="Integration">{game.integration}</Row>
          <Row label="Status">
            <StatusBadge status={game.status} />
          </Row>
        </Panel>

        <Panel title="Panel slots" bodyClassName="flex flex-col gap-3 p-5">
          <Row label="Bet controls">Platform-supplied</Row>
          <Row label="Game parameters">From the game manifest</Row>
          <Row label="Activity panel">Platform-supplied</Row>
          <p className="text-[12.5px] leading-relaxed text-ink-mute">
            A game that ships its own controls leaves the left slot empty and the canvas widens. The
            slots are host provision, not game features.
          </p>
        </Panel>
      </div>

      <Panel title="RTP profiles" bodyClassName="flex flex-col gap-2.5 p-5">
        {profiles.length === 0 ? (
          <p className="text-sm text-ink-mute">No profile has been created for this game.</p>
        ) : (
          profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-input bg-surface-1 px-3.5 py-3"
            >
              <span className="flex items-center gap-3">
                <span
                  className={
                    profile.basis_points >= 10_000
                      ? 'font-mono text-lg font-semibold tnum text-danger'
                      : 'font-mono text-lg font-semibold tnum'
                  }
                >
                  {formatPercent(profile.basis_points)}
                </span>
                <StatusBadge status={profile.status} />
              </span>
              <span className="text-[12.5px] text-ink-mute">
                {profile.operator} · {formatDate(profile.created_at)}
              </span>
            </div>
          ))
        )}
        <Link to={adminPaths.rtp} className="pt-1 text-[13px] text-accent hover:underline">
          Open RTP profiles →
        </Link>
      </Panel>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[13.5px]">
      <span className="text-ink-mute">{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  )
}
