import { useState } from 'react'

import type { Transaction } from '@/api/types'
import { Select } from '@/components/ui/Field'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { PageNav } from '@/components/ui/PageNav'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ChipTabs } from '@/components/ui/Tabs'
import { ledgerColumns, useTransactions, type HistoryFilter, type HistoryKind } from '@/features/wallet'
import { formatClock, formatDate } from '@/lib/format'
import { money } from '@/lib/money'

const kindTabs = [
  { id: 'all' as const, label: 'All' },
  { id: 'deposit' as const, label: 'Deposits' },
  { id: 'rounds' as const, label: 'Rounds' },
  { id: 'adjustment' as const, label: 'Adjustments' },
]

export function HistoryPage() {
  const [filter, setFilter] = useState<HistoryFilter>({ kind: 'all', days: 30, page: 1 })
  const historyQuery = useTransactions(filter)

  const page = historyQuery.data
  const grouped = groupByDay(page?.rows ?? [])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">History</h1>

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

      {historyQuery.isPending ? (
        <SkeletonRows count={6} />
      ) : historyQuery.isError ? (
        <ErrorState
          title="History unavailable"
          message="Your ledger could not be loaded."
          onRetry={() => void historyQuery.refetch()}
        />
      ) : !page || page.rows.length === 0 ? (
        <EmptyState
          title="Nothing in this range"
          description="Widen the date range or clear the type filter to see more of your ledger."
        />
      ) : (
        <>
          <div className="lg:hidden">
            {grouped.map(([day, rows]) => (
              <section key={day} className="flex flex-col gap-2.5 pb-5">
                <h2 className="label-mono pt-1 text-ink-mute">{day}</h2>
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
                    aside={<StatusBadge status={row.status} />}
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
