import { useState } from 'react'
import { Link } from 'react-router'

import type { AdminDeposit, DashboardGameActivity } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SeeAll } from '@/components/ui/SeeAll'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { SegmentedTrack } from '@/components/ui/Tabs'
import { useAuditEntries, useDashboard, useDepositQueue } from '@/features/admin'
import { useCurrencies } from '@/features/wallet'
import { formatClock, formatCount, formatDuration, formatPercent, formatQuantity } from '@/lib/format'
import { formatDate } from '@/lib/format'
import { formatMoney, money, type Currency } from '@/lib/money'
import { adminPaths } from '@/routes/paths'

import { DepositReviewDrawer } from './DepositReviewDrawer'

export function AdminDashboardPage() {
  const [currency, setCurrency] = useState<Currency>('PHP')
  const currenciesQuery = useCurrencies()
  const summaryQuery = useDashboard(currency)
  const queueQuery = useDepositQueue(1, 6)
  const auditQuery = useAuditEntries(1, 4)
  const [reviewing, setReviewing] = useState<AdminDeposit | null>(null)

  const summary = summaryQuery.data
  const queue = queueQuery.data?.rows ?? []
  const currencies = currenciesQuery.data ?? []
  const audit = auditQuery.data?.rows ?? []
  const pendingMeta = summary
    ? `${formatMoney(money(summary.pending_held_minor, summary.currency), { decimals: 'trim' })} held${summary.oldest_pending_at ? ` · oldest ${formatDuration(summary.oldest_pending_at)}` : ''}`
    : ''

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Today"
        meta={`${formatDate(new Date().toISOString())} · ${currency}`}
        actions={
          currencies.length > 1 ? (
            <SegmentedTrack
              items={currencies.map((entry) => ({ id: entry.code, label: entry.code }))}
              value={currency}
              onChange={setCurrency}
              label="Dashboard currency"
            />
          ) : null
        }
      />

      {summaryQuery.isError ? (
        <ErrorState
          title="Summary unavailable"
          message={`The ${currency} summary could not be loaded.`}
          onRetry={() => void summaryQuery.refetch()}
        />
      ) : summary ? (
        <div className="grid gap-3.5 sm:grid-cols-2 wide:grid-cols-4">
          <StatCard
            tone={summary.pending_deposits > 0 ? 'warning' : 'default'}
            label="Pending deposits"
            value={summary.pending_deposits}
            meta={pendingMeta}
            help="Deposit requests waiting for review. Held is their total amount; nothing reaches a wallet until a request is approved."
          />
          <StatCard
            label="Approved today"
            value={formatMoney(money(summary.approved_today_minor, summary.currency), {
              decimals: 'trim',
            })}
            meta={formatQuantity(summary.approved_today_count, 'request')}
          />
          <StatCard
            label="Staked today"
            value={formatMoney(money(summary.staked_today_minor, summary.currency), {
              decimals: 'trim',
            })}
            meta={`${formatQuantity(summary.rounds_today, 'round')} · ${formatQuantity(summary.players_today, 'player')}`}
            help="Everything wagered on rounds settled since midnight UTC, and the rounds and players behind it. A round that was refunded does not count."
          />
          <StatCard
            label="Hold today"
            value={formatMoney(money(summary.hold_today_minor, summary.currency), {
              decimals: 'trim',
            })}
            meta={`RTP ${formatPercent(summary.effective_rtp_basis_points)} · expected ${formatPercent(summary.expected_rtp_basis_points)}`}
            help="What the house kept today: stake minus wins paid out. RTP is the share of stake paid back to players; expected is what the games were set to return on those same rounds. A gap of a few points over a few hundred rounds is normal variance."
          />
        </div>
      ) : (
        <SkeletonRows count={2} />
      )}

      <div className="grid gap-5 wide:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] wide:items-start">
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">
              Deposit queue
            </h2>
            <SeeAll to={adminPaths.deposits} subject="pending deposits" />
          </div>

          {queueQuery.isPending ? (
            <SkeletonRows count={4} />
          ) : queueQuery.isError ? (
            <ErrorState
              title="Queue unavailable"
              message="Pending requests could not be loaded."
              onRetry={() => void queueQuery.refetch()}
            />
          ) : queue.length === 0 ? (
            <EmptyState title="Queue is clear" description="No deposits are waiting for review." />
          ) : (
            <RecordTable
              label="Pending deposit queue"
              columns={queueColumns(setReviewing)}
              rows={queue}
              rowKey={(row) => row.id}
              renderCard={(row) => (
                <RecordCard
                  title={row.username}
                  meta={`${row.reference} · ${row.method_name}`}
                  value={
                    <span className="text-[15px] font-medium tnum">
                      {formatMoney(money(row.amount_minor, row.currency), { decimals: 'trim' })}
                    </span>
                  }
                  aside={
                    <span className="font-mono text-[11px] text-warning">
                      {formatDuration(row.created_at)}
                    </span>
                  }
                  leading={<Avatar name={row.username} className="size-8 text-[10.5px]" />}
                  actions={
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setReviewing(row)}>
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => setReviewing(row)}>
                        Review
                      </Button>
                    </>
                  }
                />
              )}
            />
          )}

          {summary && summary.games.length > 0 ? (
            <>
              <div className="flex items-baseline justify-between gap-3 pt-2">
                <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">
                  Games today
                </h2>
                <SeeAll to={adminPaths.rounds} subject="rounds" />
              </div>
              <RecordTable
                label="Game activity today"
                columns={gameColumns(summary.currency)}
                rows={summary.games}
                rowKey={(row) => row.game_id}
                renderCard={(row) => (
                  <RecordCard
                    title={row.game_name}
                    meta={`${formatQuantity(row.rounds, 'round')} · RTP ${formatPercent(row.effective_rtp_basis_points)} · expected ${formatPercent(row.expected_rtp_basis_points)}`}
                    value={
                      <span className="text-[15px] font-medium tnum">
                        {formatMoney(money(row.hold_minor, summary.currency), { decimals: 'trim' })}
                      </span>
                    }
                    aside={
                      <span className="font-mono text-[11px] text-ink-mute">
                        staked {formatMoney(money(row.staked_minor, summary.currency), { decimals: 'trim' })}
                      </span>
                    }
                  />
                )}
              />
            </>
          ) : null}
        </section>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">
                Activity log
              </h2>
              <SeeAll to={adminPaths.audit} subject="audit entries" />
            </div>

            {auditQuery.isPending ? (
              <SkeletonRows count={3} />
            ) : auditQuery.isError ? (
              <ErrorState
                title="Activity unavailable"
                message="Recent actions could not be loaded."
                onRetry={() => void auditQuery.refetch()}
              />
            ) : audit.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="flex flex-col gap-3 rounded-card glass-panel p-4">
                {audit.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="w-11 shrink-0 font-mono text-[11.5px] text-ink-mute">
                      {formatClock(entry.created_at)}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5 text-[13px] leading-snug text-ink-soft">
                      <span>
                        {entry.operator} <span className="text-ink-mute">·</span>{' '}
                        <span className="font-mono text-[12px] text-ink-cool">{entry.action}</span>
                      </span>
                      {entry.detail ? <span className="text-ink-mute">{entry.detail}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <DepositReviewDrawer deposit={reviewing} onClose={() => setReviewing(null)} />
    </div>
  )
}

function queueColumns(onReview: (deposit: AdminDeposit) => void): Column<AdminDeposit>[] {
  return [
    {
      key: 'player',
      header: 'Player',
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="size-7 shrink-0 rounded-full bg-surface-3" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13.5px] font-medium text-ink-soft">{row.username}</span>
            {row.user_balance_minor === undefined ? null : (
              <span className="font-mono text-[11px] text-ink-mute">
                bal {formatMoney(money(row.user_balance_minor, row.currency), { decimals: 'trim' })}
              </span>
            )}
          </span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      width: '120px',
      cell: (row) => (
        <span className="text-sm font-medium tnum">
          {formatMoney(money(row.amount_minor, row.currency), { decimals: 'trim' })}
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Ref · method',
      cell: (row) => (
        <span className="flex flex-col">
          <span className="font-mono text-[12.5px]">{row.reference}</span>
          <span className="text-[11.5px] text-ink-mute">{row.method_name}</span>
        </span>
      ),
    },
    {
      key: 'waiting',
      header: 'Waiting',
      width: '100px',
      cell: (row) => (
        <span className="font-mono text-[12.5px] text-ink-mute">{formatDuration(row.created_at)}</span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      align: 'right',
      width: '190px',
      cell: (row) => (
        <span className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onReview(row)}>
            Reject
          </Button>
          <Button size="sm" onClick={() => onReview(row)}>
            Review
          </Button>
        </span>
      ),
    },
  ]
}

function gameColumns(currency: Currency): Column<DashboardGameActivity>[] {
  const amount = (minor: number) => (
    <span className="text-sm font-medium tnum">
      {formatMoney(money(minor, currency), { decimals: 'trim' })}
    </span>
  )
  return [
    {
      key: 'game',
      header: 'Game',
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <Link
            to={adminPaths.game(row.game_id)}
            className="truncate text-[13.5px] font-medium text-ink-soft hover:text-ink"
          >
            {row.game_name}
          </Link>
          <span className="font-mono text-[11px] text-ink-mute">{row.game_slug}</span>
        </span>
      ),
    },
    {
      key: 'rounds',
      header: 'Rounds',
      align: 'right',
      width: '90px',
      cell: (row) => <span className="text-sm tnum">{formatCount(row.rounds)}</span>,
    },
    {
      key: 'staked',
      header: 'Staked',
      align: 'right',
      width: '120px',
      cell: (row) => amount(row.staked_minor),
    },
    {
      key: 'returned',
      header: 'Returned',
      align: 'right',
      width: '120px',
      cell: (row) => amount(row.returned_minor),
    },
    {
      key: 'hold',
      header: 'Hold',
      align: 'right',
      width: '120px',
      cell: (row) => amount(row.hold_minor),
    },
    {
      key: 'rtp',
      header: 'RTP',
      align: 'right',
      width: '130px',
      cell: (row) => (
        <span className="flex flex-col items-end">
          <span className="text-sm tnum">{formatPercent(row.effective_rtp_basis_points)}</span>
          <span className="text-[11px] text-ink-mute tnum">
            expected {formatPercent(row.expected_rtp_basis_points)}
          </span>
        </span>
      ),
    },
  ]
}
