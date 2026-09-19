import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { ApiError } from '@/api/client'
import type { AdminGame } from '@/api/types'
import { ActiveRtp } from '@/components/admin/ActiveRtp'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select } from '@/components/ui/Field'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useAdminGames, useSetGameRtp } from '@/features/admin'
import { formatPercent } from '@/lib/format'
import { adminPaths } from '@/routes/paths'

const NEGATIVE_MARGIN = 10_000

type Switch = { game: AdminGame; basisPoints: number }

export function AdminRtpPage() {
  const gamesQuery = useAdminGames()
  const [choices, setChoices] = useState<Record<string, number>>({})
  const [pending, setPending] = useState<Switch | null>(null)

  const games = (gamesQuery.data ?? []).filter((game) => game.rtp_options.length > 0)
  const chosen = (game: AdminGame) => choices[game.id] ?? game.rtp_basis_points ?? game.rtp_options[0] ?? 0
  const choose = (game: AdminGame, basisPoints: number) =>
    setChoices((current) => ({ ...current, [game.id]: basisPoints }))

  const controls = (game: AdminGame, full = false) => {
    const selected = chosen(game)
    const unchanged = selected === game.rtp_basis_points
    return (
      <>
        <Select
          aria-label={`RTP for ${game.name}`}
          value={selected}
          onChange={(event) => choose(game, Number(event.target.value))}
          className={full ? undefined : 'w-32'}
        >
          {game.rtp_options.map((option) => (
            <option key={option} value={option}>
              {formatPercent(option)}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          className={full ? undefined : 'shrink-0'}
          disabled={unchanged}
          onClick={() => setPending({ game, basisPoints: selected })}
        >
          Activate
        </Button>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="RTP"
        meta="Each integrated game plays at one of the returns its engine ships. A switch takes effect on the next round and holds until the next switch."
      />

      <p className="flex items-start gap-3 rounded-card bg-danger/6 px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft">
        <AlertTriangle aria-hidden size={17} strokeWidth={1.5} className="mt-0.5 shrink-0 text-danger" />
        At or above 100% the house pays out more than it takes in on average.
      </p>

      {gamesQuery.isPending ? (
        <SkeletonRows count={3} />
      ) : gamesQuery.isError ? (
        <ErrorState
          title="Games unavailable"
          message="The games could not be loaded."
          onRetry={() => void gamesQuery.refetch()}
        />
      ) : games.length === 0 ? (
        <EmptyState
          title="No game has an RTP to set"
          description="A game gets RTP options when an engine on this server plays it."
          action={
            <Link to={adminPaths.games} className="text-accent-ink hover:text-accent-hi">
              Open games
            </Link>
          }
        />
      ) : (
        <RecordTable
          label="RTP by game"
          rows={games}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'game',
              header: 'Game',
              cell: (row) => (
                <Link to={adminPaths.game(row.id)} className="hover:text-ink">
                  {row.name}
                </Link>
              ),
            },
            {
              key: 'current',
              header: 'Playing at',
              align: 'right',
              width: '120px',
              cell: (row) => <ActiveRtp basisPoints={row.rtp_basis_points} />,
            },
            {
              key: 'change',
              header: 'Change to',
              align: 'right',
              width: '260px',
              cell: (row) => <span className="flex items-center justify-end gap-2">{controls(row)}</span>,
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              title={row.name}
              meta={row.rtp_basis_points === null ? 'no RTP set' : 'playing now'}
              value={<ActiveRtp basisPoints={row.rtp_basis_points} />}
              actions={controls(row, true)}
            />
          )}
        />
      )}

      {pending ? <SwitchDialog key={pending.game.id} request={pending} onClose={() => setPending(null)} /> : null}
    </div>
  )
}

function SwitchDialog({ request, onClose }: { request: Switch; onClose: () => void }) {
  const setRtp = useSetGameRtp()
  const [error, setError] = useState<string | undefined>(undefined)
  const { game, basisPoints } = request
  const phrase = formatPercent(basisPoints)
  const negativeMargin = basisPoints >= NEGATIVE_MARGIN

  const confirm = async () => {
    setError(undefined)
    try {
      await setRtp.mutateAsync({ gameId: game.id, basisPoints })
      onClose()
    } catch (failure) {
      if (failure instanceof ApiError) {
        setError(failure.fields.rtp_basis_points ?? failure.message)
        return
      }
      setError('The request could not be sent. Check your connection and try again.')
    }
  }

  return (
    <ConfirmDialog
      open
      title={`Switch ${game.name} to ${phrase}?`}
      description={`Every new round settles at ${phrase}. Rounds already open are unaffected.`}
      confirmLabel={`Switch to ${phrase}`}
      tone={negativeMargin ? 'destructive' : 'primary'}
      pending={setRtp.isPending}
      onConfirm={() => void confirm()}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {negativeMargin ? (
          <p className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-danger">
            <AlertTriangle aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
            Above 100% the house pays out more than it takes in on average.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </ConfirmDialog>
  )
}
