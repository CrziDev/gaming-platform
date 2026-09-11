import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useState } from 'react'

import type { Transaction } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ChipTabs } from '@/components/ui/Tabs'
import { useTransactions, useWalletSummary, type HistoryFilter, type HistoryKind } from '@/features/wallet'
import { formatClock, formatDate, formatDateTime } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'

const kindTabs = [
  { id: 'all' as const, label: 'All' },
  { id: 'deposit' as const, label: 'Deposits' },
  { id: 'rounds' as const, label: 'Rounds' },
  { id: 'adjustment' as const, label: 'Adjustments' },
]

export function HistoryPage() {
  const [filter, setFilter] = useState<HistoryFilter>({ kind: 'all', days: 30, page: 1 })
  const historyQuery = useTransactions(filter)
  const summaryQuery = useWalletSummary()

  const page = historyQuery.data
  const grouped = groupByDay(page?.rows ?? [])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">History</h1>

        <div className="flex items-center gap-2.5">
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

          <Button variant="secondary" size="sm" className="hidden lg:inline-flex">
            <Download aria-hidden size={15} strokeWidth={1.5} />
            Export CSV
          </Button>
        </div>
      </header>

      <ChipTabs
        items={kindTabs}
        value={filter.kind}
        onChange={(kind: HistoryKind) => setFilter((current) => ({ ...current, kind, page: 1 }))}
        label="Filter by type"
      />

      {summaryQuery.data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label={`Deposited · ${filter.days}d`}
            value={formatMoney(money(summaryQuery.data.deposited_30d_minor, summaryQuery.data.currency))}
          />
          <StatCard
            label={`Staked · ${filter.days}d`}
            value={formatMoney(money(summaryQuery.data.staked_30d_minor, summaryQuery.data.currency))}
          />
          <StatCard
            label={`Returned · ${filter.days}d`}
            value={formatMoney(money(summaryQuery.data.returned_30d_minor, summaryQuery.data.currency))}
          />
        </div>
      ) : null}

      {historyQuery.isPending ? (
        <SkeletonRows count={6} />
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
              columns={columns}
              rows={page.rows}
              rowKey={(row) => row.id}
              renderCard={() => null}
            />
          </div>

          <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
            <span className="font-mono text-[12px] text-ink-mute">
              {(page.page - 1) * page.size + 1}–{Math.min(page.page * page.size, page.total)} of{' '}
              {page.total}
            </span>

            <div className="hidden items-center gap-1.5 lg:flex">
              <Button
                variant="secondary"
                size="sm"
                aria-label="Previous page"
                disabled={page.page === 1}
                onClick={() => setFilter((current) => ({ ...current, page: current.page - 1 }))}
                className="size-11 px-0"
              >
                <ChevronLeft aria-hidden size={16} strokeWidth={1.5} />
              </Button>
              <span className="px-2 font-mono text-[13px] tnum">
                {page.page} / {page.pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Next page"
                disabled={page.page >= page.pages}
                onClick={() => setFilter((current) => ({ ...current, page: current.page + 1 }))}
                className="size-11 px-0"
              >
                <ChevronRight aria-hidden size={16} strokeWidth={1.5} />
              </Button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              disabled={page.page >= page.pages}
              onClick={() => setFilter((current) => ({ ...current, page: current.page + 1 }))}
              className="lg:hidden"
            >
              Load 20 more
            </Button>
          </nav>
        </>
      )}
    </div>
  )
}

const columns: Column<Transaction>[] = [
  {
    key: 'date',
    header: 'Date',
    width: '190px',
    cell: (row) => <span className="font-mono text-[13px] text-ink-mute">{formatDateTime(row.created_at)}</span>,
  },
  { key: 'type', header: 'Type', cell: (row) => row.label },
  {
    key: 'reference',
    header: 'Reference',
    width: '140px',
    cell: (row) => <span className="font-mono text-[13px] text-ink-mute">{row.reference}</span>,
  },
  { key: 'status', header: 'Status', width: '130px', cell: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    width: '160px',
    cell: (row) => (
      <MoneyDisplay value={money(row.amount_minor, row.currency)} tone="auto" sign="always" />
    ),
  },
]

function groupByDay(rows: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>()

  for (const row of rows) {
    const day = formatDate(row.created_at)
    groups.set(day, [...(groups.get(day) ?? []), row])
  }

  return [...groups.entries()]
}
