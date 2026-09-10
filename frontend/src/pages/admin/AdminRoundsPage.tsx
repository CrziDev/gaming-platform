import { PageHeading } from '@/components/admin/PageHeading'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { useAdminRounds } from '@/features/admin'
import { formatDateTime, formatMultiplier } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'

export function AdminRoundsPage() {
  const roundsQuery = useAdminRounds()

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Game rounds"
        meta="Every settled round. A stake and its return are one row here and two rows in the ledger."
      />

      {roundsQuery.isPending ? (
        <SkeletonRows count={8} />
      ) : (roundsQuery.data ?? []).length === 0 ? (
        <EmptyState title="No rounds" description="Nothing has been played in this range." />
      ) : (
        <RecordTable
          label="Game rounds"
          rows={roundsQuery.data ?? []}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'round',
              header: 'Round',
              width: '130px',
              cell: (row) => <span className="font-mono text-[12.5px]">{row.id}</span>,
            },
            {
              key: 'time',
              header: 'Settled',
              width: '190px',
              cell: (row) => (
                <span className="text-[13px] text-ink-mute">{formatDateTime(row.created_at)}</span>
              ),
            },
            { key: 'game', header: 'Game', cell: (row) => row.game_name },
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
                <span className="font-mono text-sm tnum text-ink-mute">
                  {row.multiplier_hundredths ? formatMultiplier(row.multiplier_hundredths) : '—'}
                </span>
              ),
            },
            {
              key: 'result',
              header: 'Result',
              align: 'right',
              width: '150px',
              cell: (row) => (
                <MoneyDisplay value={money(row.result_minor, row.currency)} tone="auto" sign="always" />
              ),
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              title={row.game_name}
              meta={`${row.id} · ${formatDateTime(row.created_at)}`}
              value={
                <MoneyDisplay
                  value={money(row.result_minor, row.currency)}
                  tone="auto"
                  sign="always"
                  className="text-sm"
                />
              }
            />
          )}
        />
      )}
    </div>
  )
}
