import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { formatMultiplier, formatRelative } from '@/lib/format'
import { formatMoney, money, type Currency } from '@/lib/money'

export type PlinkoBet = {
  id: string
  player: string
  stake_minor: number
  multiplier_hundredths: number
  // Win minus stake, so a bucket under 1× reads as the loss it is.
  profit_minor: number
  currency: Currency
  placed_at: string
}

type PlinkoHistoryProps = {
  bets: readonly PlinkoBet[]
}

const columns: Column<PlinkoBet>[] = [
  { key: 'player', header: 'Player', cell: (bet) => <span className="font-medium">{bet.player}</span> },
  {
    key: 'bet',
    header: 'Bet',
    align: 'right',
    cell: (bet) => <span className="font-mono tnum">{formatMoney(money(bet.stake_minor, bet.currency))}</span>,
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
    cell: (bet) => <MoneyDisplay value={money(bet.profit_minor, bet.currency)} tone="auto" sign="always" />,
  },
  {
    key: 'placed',
    header: 'When',
    align: 'right',
    columnClass: 'font-mono text-[11.5px] text-ink-mute',
    cell: (bet) => formatRelative(bet.placed_at),
  },
]

// The bets feed under the board. Static fixture rows until settled rounds feed it.
export function PlinkoHistory({ bets }: PlinkoHistoryProps) {
  if (bets.length === 0) return null

  return (
    <section aria-label="Recent bets" className="flex flex-col gap-3 rounded-card bg-surface-1 p-3.5">
      <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">Recent bets</h2>
      <RecordTable
        label="Recent bets"
        columns={columns}
        rows={[...bets]}
        rowKey={(bet) => bet.id}
        renderCard={(bet) => (
          <RecordCard
            title={bet.player}
            meta={`${formatMoney(money(bet.stake_minor, bet.currency))} · ${formatMultiplier(bet.multiplier_hundredths)} · ${formatRelative(bet.placed_at)}`}
            value={<MoneyDisplay value={money(bet.profit_minor, bet.currency)} tone="auto" sign="always" />}
          />
        )}
      />
    </section>
  )
}
