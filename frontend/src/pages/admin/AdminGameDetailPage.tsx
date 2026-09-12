import { ChevronLeft, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import type { RtpProfile } from '@/api/types'
import { ActiveRtp } from '@/components/admin/ActiveRtp'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAdminGame, useGameRtpProfiles } from '@/features/admin'
import { formatCount, formatDate, formatPercent } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { adminPaths } from '@/routes/paths'

import { GameFormDialog } from './GameFormDialog'
import { RtpProfileDialog } from './RtpProfileDialog'

export function AdminGameDetailPage() {
  const { id = '' } = useParams()
  const gameQuery = useAdminGame(id)
  const profilesQuery = useGameRtpProfiles(id)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<{ open: boolean; profile?: RtpProfile }>({ open: false })

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
        description="This game is not in the catalogue."
        action={
          <Link to={adminPaths.games} className="text-accent-ink hover:text-accent-hi">
            Back to games
          </Link>
        }
      />
    )
  }

  const profiles = profilesQuery.data ?? []

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
        <StatCard
          label="Active RTP"
          value={game.active_rtp_basis_points === null ? '—' : formatPercent(game.active_rtp_basis_points)}
        />
        <StatCard label="Rounds 30d" value={formatCount(game.rounds_30d)} />
        <StatCard label="Category" value={game.category_name} />
        <StatCard label="Provider" value={game.provider} />
      </div>

      <div className="grid gap-5 wide:grid-cols-2 wide:items-start">
        <Panel title="Configuration" bodyClassName="flex flex-col gap-3 p-5">
          <Row label="Slug">
            <span className="font-mono">{game.slug}</span>
          </Row>
          <Row label="Currency">
            <span className="font-mono">{game.currency}</span>
          </Row>
          <Row label="Minimum bet">
            <span className="font-mono tnum">{formatMoney(money(game.min_wager_minor, game.currency))}</span>
          </Row>
          <Row label="Maximum bet">
            <span className="font-mono tnum">{formatMoney(money(game.max_wager_minor, game.currency))}</span>
          </Row>
          <Row label="Bet step">
            <span className="font-mono tnum">{formatMoney(money(game.wager_step_minor, game.currency))}</span>
          </Row>
          <Row label="Integration">{game.integration.replace('_', ' ')}</Row>
          <Row label="Status">
            <StatusBadge status={game.status} />
          </Row>
          <Row label="Added">{formatDate(game.created_at)}</Row>
          {game.description ? (
            <p className="pt-1 text-[12.5px] leading-relaxed text-ink-mute">{game.description}</p>
          ) : null}
        </Panel>

        <Panel title="Panel slots" bodyClassName="flex flex-col gap-3 p-5">
          <Row label="Bet controls">Platform-supplied</Row>
          <Row label="Game parameters">From the game manifest</Row>
          <Row label="Activity panel">Platform-supplied</Row>
          <p className="text-[12.5px] leading-relaxed text-ink-mute">
            A game that ships its own controls leaves the left slot empty and the canvas widens. The
            slots are host provision, not game features. Integration state is set by the engine
            review, never here.
          </p>
        </Panel>
      </div>

      <Panel
        title="RTP profiles"
        action={
          <Button size="sm" variant="secondary" onClick={() => setDraft({ open: true })}>
            <Plus aria-hidden size={14} strokeWidth={2} />
            New draft
          </Button>
        }
        bodyClassName="flex flex-col gap-2.5 p-5"
      >
        {profilesQuery.isPending ? (
          <SkeletonRows count={2} />
        ) : profilesQuery.isError ? (
          <p className="text-sm text-danger">The profiles could not be loaded.</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-ink-mute">No profile has been drafted for this game.</p>
        ) : (
          profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-input bg-surface-1 px-3.5 py-3"
            >
              <span className="flex items-center gap-3">
                <ActiveRtp basisPoints={profile.target_basis_points} size="lg" />
                <span className="flex flex-col">
                  <span className="text-[13px] text-ink-soft">
                    {profile.name} <span className="font-mono text-ink-mute">v{profile.version}</span>
                  </span>
                  <span className="text-[12px] text-ink-mute">
                    {profile.created_by_display_name || 'System'} · {formatDate(profile.created_at)}
                  </span>
                </span>
                <StatusBadge status={profile.status} />
              </span>
              {profile.status === 'draft' ? (
                <Button size="sm" variant="ghost" onClick={() => setDraft({ open: true, profile })}>
                  Edit draft
                </Button>
              ) : null}
            </div>
          ))
        )}
        <Link to={adminPaths.rtp} className="pt-1 text-[13px] text-accent-ink hover:text-accent-hi">
          Open RTP profiles →
        </Link>
      </Panel>

      <GameFormDialog open={editing} game={game} onClose={() => setEditing(false)} />
      <RtpProfileDialog
        open={draft.open}
        game={game}
        {...(draft.profile ? { profile: draft.profile } : {})}
        onClose={() => setDraft({ open: false })}
      />
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
