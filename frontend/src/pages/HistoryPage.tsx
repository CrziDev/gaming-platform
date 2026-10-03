import { useState } from 'react'

import type { Round, Transaction } from '@/api/types'
import { Select } from '@/components/ui/Field'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { PageNav } from '@/components/ui/PageNav'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ChipTabs } from '@/components/ui/Tabs'
import {
  LedgerStatus,
  ledgerColumns,
  useRounds,
  useTransactions,
  useWalletSummary,
  type HistoryFilter,
  type HistoryKind,
  type SummaryFilter,
} from '@/features/wallet'
import { formatClock, formatDate, formatMultiplier } from '@/lib/format'
import { formatMoney, money, type Money } from '@/lib/money'

const kindTabs = [
  { id: 'all' as const, label: 'All' },
  { id: 'deposit' as const, label: 'Deposits' },
  { id: 'withdrawal' as const, label: 'Withdrawals' },
  { id: 'rounds' as const, label: 'Rounds' },
  { id: 'adjustment' as const, label: 'Adjustments' },
]

export function HistoryPage() {
  const [filter, setFilter] = useState<HistoryFilter>({ kind: 'all', days: 30, page: 1 })
  const showingRounds = filter.kind === 'rounds'
  const historyQuery = useTransactions(filter, !showingRounds)
  const summaryFilter: SummaryFilter = {
    days: filter.days,
    ...(filter.currency ? { currency: filter.currency } : {}),
  }
  const roundsQuery = useRounds(
    {
      days: filter.days,
      page: filter.page,
      ...(filter.currency ? { currency: filter.currency } : {}),
    },
    showingRounds,
  )

  const page = historyQuery.data
  const grouped = groupByDay(page?.rows ?? [])
  const roundPage = roundsQuery.data
  const groupedRounds = groupRoundsByDay(roundPage?.rows ?? [])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-bold tracking-[-0.02em] text-ink">History</h1>

        <Select
          aria-label="Date range"
          value={String(filter.days)}
          onChange={(event) =>
            setFilter((current) => ({
              ...current,
              days: Number(event.target.value) as HistoryFilter['days'],
              page: 1,
            }))
          }
          className="min-h-11 w-44"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
      </header>

      <ChipTabs
        items={kindTabs}
        value={filter.kind}
        onChange={(kind: HistoryKind) => setFilter((current) => ({ ...current, kind, page: 1 }))}
        label="Filter by type"
      />

      <SummaryStrip filter={summaryFilter} />

      {showingRounds ? (
        roundsQuery.isPending ? (
          <SkeletonRows count={6} />
        ) : roundsQuery.isError ? (
          <ErrorState
            title="Round history unavailable"
            message="Your rounds could not be loaded."
            onRetry={() => void roundsQuery.refetch()}
          />
        ) : !roundPage || roundPage.rows.length === 0 ? (
          <EmptyState
            title="No rounds in this range"
            description="Try a wider date range."
          />
        ) : (
          <>
            <div className="lg:hidden">
              {groupedRounds.map(([day, rows]) => (
                <section key={day} className="flex flex-col gap-2.5 pb-5">
                  <h2 className="label-mono pt-1 text-ink-cool">{day}</h2>
                  {rows.map((round) => (
                    <RecordCard
                      key={round.id}
                      title={round.game_name}
                      meta={`${formatClock(round.started_at)} · ${round.id.slice(0, 8)}`}
                      value={<RoundReturn round={round} />}
                      aside={<StatusBadge status={round.status} />}
                    />
                  ))}
                </section>
              ))}
            </div>

            <div className="hidden lg:block">
              <RecordTable
                label="Round history"
                rows={roundPage.rows}
                rowKey={(round) => round.id}
                columns={[
                  {
                    key: 'date',
                    header: 'Started',
                    width: '180px',
                    cell: (round) => (
                      <span className="font-mono text-[13px] text-ink-mute">
                        {formatDate(round.started_at)} · {formatClock(round.started_at)}
                      </span>
                    ),
                  },
                  { key: 'game', header: 'Game', cell: (round) => round.game_name },
                  {
                    key: 'stake',
                    header: 'Stake',
                    align: 'right',
                    cell: (round) => (
                      <span className="text-sm tnum">
                        {formatMoney(money(round.stake_minor, round.currency))}
                      </span>
                    ),
                  },
                  {
                    key: 'multiplier',
                    header: 'Multiplier',
                    align: 'right',
                    cell: (round) => (
                      <span className="text-sm text-ink-mute tnum">
                        {round.multiplier_hundredths === null
                          ? '—'
                          : formatMultiplier(round.multiplier_hundredths)}
                      </span>
                    ),
                  },
                  { key: 'status', header: 'Status', cell: (round) => <StatusBadge status={round.status} /> },
                  {
                    key: 'return',
                    header: 'Return',
                    align: 'right',
                    cell: (round) => <RoundReturn round={round} />,
                  },
                ]}
                renderCard={() => null}
              />
            </div>

            <PageNav
              page={roundPage.page}
              pages={roundPage.pages}
              size={roundPage.size}
              total={roundPage.total}
              onChange={(next) => setFilter((current) => ({ ...current, page: next }))}
            />
          </>
        )
      ) : historyQuery.isPending ? (
        <SkeletonRows count={6} />
      ) : historyQuery.isError ? (
        <ErrorState
          title="History unavailable"
          message="Your history could not be loaded."
          onRetry={() => void historyQuery.refetch()}
        />
      ) : !page || page.rows.length === 0 ? (
        <EmptyState
          title="Nothing in this range"
          description="Try a wider date range or a different filter."
        />
      ) : (
        <>
          <div className="lg:hidden">
            {grouped.map(([day, rows]) => (
              <section key={day} className="flex flex-col gap-2.5 pb-5">
                <h2 className="label-mono pt-1 text-ink-cool">{day}</h2>
                {rows.map((row) => (
                  <RecordCard
                    key={row.id}
                    title={row.label}
                    meta={`${formatClock(row.created_at)} · ${row.reference}`}
                    value={
                      <MoneyDisplay
                        value={money(row.amount_minor, row.currency)}
                        tone="auto"
                        sign="always"
                        className="text-sm"
                      />
                    }
                    aside={<LedgerStatus status={row.status} />}
                  />
                ))}
              </section>
            ))}
          </div>

          <div className="hidden lg:block">
            <RecordTable
              label="Transaction history"
              columns={ledgerColumns}
              rows={page.rows}
              rowKey={(row) => row.id}
              renderCard={() => null}
            />
          </div>

          <PageNav
            page={page.page}
            pages={page.pages}
            size={page.size}
            total={page.total}
            onChange={(next) => setFilter((current) => ({ ...current, page: next }))}
          />
        </>
      )}
    </div>
  )
}

function groupByDay(rows: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>()

  for (const row of rows) {
    const day = formatDate(row.created_at)
    groups.set(day, [...(groups.get(day) ?? []), row])
  }

  return [...groups.entries()]
}

function groupRoundsByDay(rows: Round[]): [string, Round[]][] {
  const groups = new Map<string, Round[]>()

  for (const row of rows) {
    const day = formatDate(row.started_at)
    groups.set(day, [...(groups.get(day) ?? []), row])
  }

  return [...groups.entries()]
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

function SummaryStrip({ filter }: { filter: SummaryFilter }) {
  const summaryQuery = useWalletSummary(filter)

  if (summaryQuery.isPending) {
    return (
      <div role="status" aria-label="Loading summary" className="grid grid-cols-3 gap-2 sm:gap-3">
        <Skeleton className="h-[58px] rounded-tile" />
        <Skeleton className="h-[58px] rounded-tile" />
        <Skeleton className="h-[58px] rounded-tile" />
      </div>
    )
  }
  if (summaryQuery.isError) {
    return (
      <ErrorState
        title="Summary unavailable"
        message="Your totals could not be loaded."
        onRetry={() => void summaryQuery.refetch()}
      />
    )
  }
  if (summaryQuery.data.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {summaryQuery.data.map((entry) => (
        <section
          key={entry.currency}
          aria-label={`${entry.currency} summary`}
          className="grid grid-cols-3 gap-2 sm:gap-3"
        >
          <SummaryFigure label="Deposited" value={money(entry.deposited_minor, entry.currency)} />
          <SummaryFigure label="Staked" value={money(entry.staked_minor, entry.currency)} />
          <SummaryFigure label="Returned" value={money(entry.returned_minor, entry.currency)} />
        </section>
      ))}
    </div>
  )
}

function SummaryFigure({ label, value }: { label: string; value: Money }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-tile glass-panel px-3 py-2.5 sm:px-4 sm:py-3">
      <span className="label-mono text-ink-cool">{label}</span>
      <span className="text-[13.5px] font-medium [overflow-wrap:anywhere] text-ink tnum sm:text-[16px]">
        {formatMoney(value)}
      </span>
    </div>
  )
}
