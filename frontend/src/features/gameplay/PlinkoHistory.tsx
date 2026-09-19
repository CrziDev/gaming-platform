import type { ReactNode } from 'react'

import type { Round } from '@/api/types'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useRecentRounds } from '@/features/wallet'
import { formatMultiplier, formatRelative } from '@/lib/format'
import { formatMoney, money, subtractMoney, type Money } from '@/lib/money'

type PlinkoBet = {
  id: string
  stake: Money
  multiplier_hundredths: number
  // Win minus stake, so a bucket under 1× reads as the loss it is.
  profit: Money
  placed_at: string
}

// Only a settled round has a multiplier and a win to show; anything else a
// two-phase engine might leave behind has no row here.
function toBet(round: Round): PlinkoBet | null {
  if (round.status !== 'settled' || round.win_minor === null || round.multiplier_hundredths === null) return null
  const stake = money(round.stake_minor, round.currency)
  return {
    id: round.id,
    stake,
    multiplier_hundredths: round.multiplier_hundredths,
    profit: subtractMoney(money(round.win_minor, round.currency), stake),
    placed_at: round.settled_at ?? round.started_at,
  }
}

const columns: Column<PlinkoBet>[] = [
  {
    key: 'bet',
    header: 'Bet',
    cell: (bet) => <span className="font-mono tnum">{formatMoney(bet.stake)}</span>,
  },
  {
    key: 'multiplier',
    header: 'Multiplier',
    align: 'right',
    cell: (bet) => <span className="font-mono tnum">{formatMultiplier(bet.multiplier_hundredths)}</span>,
  },
  {
    key: 'profit',
    header: 'Profit',
    align: 'right',
    cell: (bet) => <MoneyDisplay value={bet.profit} tone="auto" sign="always" />,
  },
  {
    key: 'placed',
    header: 'When',
    align: 'right',
    columnClass: 'font-mono text-[11.5px] text-ink-mute',
    cell: (bet) => formatRelative(bet.placed_at),
  },
]

type PlinkoHistoryProps = {
  gameId: string
}

function Feed({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Your recent bets" className="flex flex-col gap-3 rounded-card bg-surface-1 p-3.5">
      <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">Your recent bets</h2>
      {children}
    </section>
  )
}

// The player's own recent rounds on this game, under the board. The session
// refetches rounds when a ball lands, so a bet appears here as it is revealed.
export function PlinkoHistory({ gameId }: PlinkoHistoryProps) {
  const query = useRecentRounds(gameId)

  if (query.isPending) {
    return (
      <Feed>
        <SkeletonRows count={3} />
      </Feed>
    )
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Recent bets unavailable"
        message="Your rounds on this game could not be loaded. The board and your balance are unaffected."
        onRetry={() => void query.refetch()}
      />
    )
  }

  const bets = query.data.map(toBet).filter((bet): bet is PlinkoBet => bet !== null)
  if (bets.length === 0) {
    return (
      <Feed>
        <p className="text-[13px] text-ink-mute text-pretty">Your bets on this game appear here as they settle.</p>
      </Feed>
    )
  }

  return (
    <Feed>
      <RecordTable
        label="Your recent bets"
        columns={columns}
        rows={bets}
        rowKey={(bet) => bet.id}
        renderCard={(bet) => (
          <RecordCard
            title={formatMoney(bet.stake)}
            meta={`${formatMultiplier(bet.multiplier_hundredths)} · ${formatRelative(bet.placed_at)}`}
            value={<MoneyDisplay value={bet.profit} tone="auto" sign="always" />}
          />
        )}
      />
    </Feed>
  )
}
