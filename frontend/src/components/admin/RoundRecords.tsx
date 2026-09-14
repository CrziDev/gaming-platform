import type { AdminRound, Round } from '@/api/types'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDateTime, formatMultiplier } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'

type RoundRecordsProps = {
  rows: Round[]
  showPlayer?: boolean
}

export function RoundRecords({ rows, showPlayer = false }: RoundRecordsProps) {
  const columns: Column<Round>[] = [
    {
      key: 'round',
      header: 'Round',
      width: '110px',
      cell: (row) => <span className="font-mono text-[12.5px]">{row.id.slice(0, 8)}</span>,
    },
    {
      key: 'time',
      header: 'Started',
      width: '190px',
      cell: (row) => (
        <span className="text-[13px] text-ink-mute">{formatDateTime(row.started_at)}</span>
      ),
    },
    { key: 'game', header: 'Game', cell: (row) => row.game_name },
  ]

  if (showPlayer) {
    columns.push({
      key: 'player',
      header: 'Player',
      cell: (row) => {
        const adminRound = row as AdminRound
        return adminRound.display_name || adminRound.user_email
      },
    })
  }

  columns.push(
    {
      key: 'stake',
      header: 'Stake',
      align: 'right',
      cell: (row) => (
        <span className="font-mono text-sm tnum">
          {formatMoney(money(row.stake_minor, row.currency))}
        </span>
      ),
    },
    {
      key: 'multiplier',
      header: 'Multiplier',
      align: 'right',
      cell: (row) => (
        <span className="font-mono text-sm text-ink-mute tnum">
          {row.multiplier_hundredths === null
            ? '—'
            : formatMultiplier(row.multiplier_hundredths)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'return',
      header: 'Return',
      align: 'right',
      width: '150px',
      cell: (row) => <RoundReturn round={row} />,
    },
  )

  return (
    <RecordTable
      label="Game rounds"
      rows={rows}
      rowKey={(row) => row.id}
      columns={columns}
      renderCard={(row) => (
        <RecordCard
          title={row.game_name}
          meta={`${showPlayer ? `${playerName(row)} · ` : ''}${row.id.slice(0, 8)} · ${formatDateTime(row.started_at)}`}
          value={<RoundReturn round={row} />}
          aside={<StatusBadge status={row.status} />}
        />
      )}
    />
  )
}

function playerName(round: Round): string {
  const adminRound = round as AdminRound
  return adminRound.display_name || adminRound.user_email
}

function RoundReturn({ round }: { round: Round }) {
  if (round.win_minor === null) {
    return <span className="font-mono text-sm text-ink-mute">—</span>
  }
  return (
    <MoneyDisplay
      value={money(round.win_minor, round.currency)}
      tone={round.win_minor > 0 ? 'auto' : 'neutral'}
      className="text-sm"
    />
  )
}
