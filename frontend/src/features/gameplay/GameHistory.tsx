import type { ReactNode } from 'react'
import type { Round } from '@/api/types'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SeeAll } from '@/components/ui/SeeAll'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useRecentRounds } from '@/features/wallet'
import { formatMultiplier, formatRelative } from '@/lib/format'
import { formatMoney, money, subtractMoney, type Currency, type Money } from '@/lib/money'
import { paths } from '@/routes/paths'

type HistoryRow = {
  id: string
  stake: Money
  multiplier_hundredths: number
  // Win minus stake, so a bucket under 1× reads as the loss it is.
  profit: Money
  placed_at: string
}

// Only a settled round has a multiplier and a win to show; anything else a
// two-phase engine might leave behind has no row here.
function toRow(round: Round): HistoryRow | null {
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

const columns: Column<HistoryRow>[] = [
  {
    key: 'bet',
    header: 'Bet',
    cell: (row) => <span className="tnum">{formatMoney(row.stake)}</span>,
  },
  {
    key: 'multiplier',
    header: 'Multiplier',
    align: 'right',
    cell: (row) => <span className="tnum">{formatMultiplier(row.multiplier_hundredths)}</span>,
  },
  {
    key: 'profit',
    header: 'Profit',
    align: 'right',
    cell: (row) => <MoneyDisplay value={row.profit} tone="auto" sign="always" />,
  },
  {
    key: 'placed',
    header: 'When',
    align: 'right',
    columnClass: 'font-mono text-[11.5px] text-ink-mute',
    cell: (row) => formatRelative(row.placed_at),
  },
]

type GameHistoryProps = {
  gameId: string
  currency: Currency
}

function HistorySection({ children }: { children: ReactNode }) {
  return (
    <section aria-label="History" className="flex flex-col gap-3 rounded-card glass-panel p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">History</h2>
        <SeeAll to={paths.history} subject="history" />
      </div>
      {children}
    </section>
  )
}

// Under every title's board: the player's own recent rounds on this game. An
// integrated game's session refetches rounds when a result is revealed, so a
// bet appears here as it lands.
export function GameHistory({ gameId, currency }: GameHistoryProps) {
  const query = useRecentRounds(gameId, currency)

  if (query.isPending) {
    return (
      <HistorySection>
        <SkeletonRows count={3} />
      </HistorySection>
    )
  }

  if (query.isError) {
    return (
      <ErrorState
        title="History unavailable"
        message="Your recent bets could not be loaded."
        onRetry={() => void query.refetch()}
      />
    )
  }

  const rows = query.data.map(toRow).filter((row): row is HistoryRow => row !== null)
  if (rows.length === 0) {
    return (
      <HistorySection>
        <p className="text-[13px] text-ink-mute text-pretty">Your bets on this game will appear here.</p>
      </HistorySection>
    )
  }

  return (
    <HistorySection>
      <RecordTable
        label="History"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        renderCard={(row) => (
          <RecordCard
            title={formatMoney(row.stake)}
            meta={`${formatMultiplier(row.multiplier_hundredths)} · ${formatRelative(row.placed_at)}`}
            value={<MoneyDisplay value={row.profit} tone="auto" sign="always" />}
          />
        )}
      />
    </HistorySection>
  )
}
