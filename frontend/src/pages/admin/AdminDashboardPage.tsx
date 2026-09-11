import { useState } from 'react'
import { Link } from 'react-router'

import type { AdminDeposit } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { StatCard } from '@/components/ui/StatCard'
import { useAuditEntries, useConsoleAlerts, useDashboard, useDepositQueue } from '@/features/admin'
import { cn } from '@/lib/cn'
import { formatClock, formatCount, formatDuration, formatPercent } from '@/lib/format'
import { formatDate } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { adminPaths } from '@/routes/paths'

import { DepositReviewDrawer } from './DepositReviewDrawer'

export function AdminDashboardPage() {
  const summaryQuery = useDashboard()
  const queueQuery = useDepositQueue()
  const alertsQuery = useConsoleAlerts()
  const auditQuery = useAuditEntries(4)
  const [reviewing, setReviewing] = useState<AdminDeposit | null>(null)

  const summary = summaryQuery.data
  const queue = queueQuery.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Today"
        meta={`${formatDate(new Date().toISOString())} · all figures in ${summary?.currency ?? 'PHP'}, account currency`}
      />

      {summary ? (
        <div className="grid gap-3.5 sm:grid-cols-2 wide:grid-cols-4">
          <StatCard
            tone="warning"
            label="Pending deposits"
            value={summary.pending_deposits}
            meta={`${formatMoney(money(summary.pending_held_minor, summary.currency), { decimals: 'trim' })} held · oldest ${formatDuration(summary.oldest_pending_at)}`}
          />
          <StatCard
            label="Approved today"
            value={formatMoney(money(summary.approved_today_minor, summary.currency), {
              decimals: 'trim',
            })}
            meta={`${summary.approved_today_count} requests`}
          />
          <StatCard
            label="Staked today"
            value={formatMoney(money(summary.staked_today_minor, summary.currency), {
              decimals: 'trim',
            })}
            meta={`${formatCount(summary.rounds_today)} rounds · ${summary.players_today} players`}
          />
          <StatCard
            label="Returned today"
            value={formatMoney(money(summary.returned_today_minor, summary.currency), {
              decimals: 'trim',
            })}
            meta={`Effective ${formatPercent(summary.effective_rtp_basis_points)} · target ${formatPercent(summary.target_rtp_basis_points)}`}
          />
        </div>
      ) : (
        <SkeletonRows count={2} />
      )}

      <div className="grid gap-5 wide:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] wide:items-start">
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">Deposit queue</h2>
            <Link to={adminPaths.deposits} className="text-[13px] text-accent hover:underline">
              Open full queue
            </Link>
          </div>

          {queueQuery.isPending ? (
            <SkeletonRows count={4} />
          ) : queue.length === 0 ? (
            <EmptyState title="Queue is clear" description="No deposit is waiting on a human." />
          ) : (
            <RecordTable
              label="Pending deposit queue"
              columns={queueColumns(setReviewing)}
              rows={queue.slice(0, 6)}
              rowKey={(row) => row.id}
              renderCard={(row) => (
                <RecordCard
                  title={row.username}
                  meta={`${row.reference} · ${row.method_name}`}
                  value={
                    <span className="font-mono text-[15px] font-semibold tnum">
                      {formatMoney(money(row.amount_minor, row.currency), { decimals: 'trim' })}
                    </span>
                  }
                  aside={
                    <span className="font-mono text-[11px] text-warning">
                      {formatDuration(row.created_at)}
                    </span>
                  }
                  leading={<span aria-hidden className="size-8 shrink-0 rounded-full bg-line" />}
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
              footer={
                <p className="font-mono text-[10.5px] text-ink-mute">
                  Oldest first, never newest. Approve is only reachable inside Review — the proof must
                  be seen before funds move.
                </p>
              }
            />
          )}
        </section>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3.5 rounded-card border border-line bg-panel p-4">
            <h2 className="font-display text-[17px] font-semibold text-ink">Needs attention</h2>
            <ul className="flex flex-col gap-2.5">
              {alertsQuery.data?.map((alert) => (
                <li key={alert.id}>
                  <Link
                    to={alert.href}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-input border px-3 text-[13px]',
                      alert.tone === 'warning' && 'border-warning/35 bg-warning/6',
                      alert.tone === 'danger' && 'border-danger/35 bg-danger/6',
                      alert.tone === 'neutral' && 'border-line bg-surface-1',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        alert.tone === 'warning' && 'bg-warning',
                        alert.tone === 'danger' && 'bg-highlight',
                        alert.tone === 'neutral' && 'bg-ink-mute',
                      )}
                    />
                    <span className="flex-1 text-ink">{alert.message}</span>
                    <span className="text-[12px] text-accent">View</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-[12px] leading-relaxed text-ink-mute">
              Only states a human must resolve or has deliberately created. Nothing informational,
              nothing that clears itself.
            </p>
          </section>

          <section className="flex flex-col gap-3.5 rounded-card border border-line bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[17px] font-semibold text-ink">Activity log</h2>
              <Link to={adminPaths.audit} className="text-[12.5px] text-accent hover:underline">
                All
              </Link>
            </div>
            <ul className="flex flex-col gap-3">
              {auditQuery.data?.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="w-11 shrink-0 font-mono text-[11.5px] text-ink-mute">
                    {formatClock(entry.created_at)}
                  </span>
                  <span className="text-[13px] leading-snug text-ink-soft">{entry.detail}</span>
                </li>
              ))}
            </ul>
            <p className="text-[12px] leading-relaxed text-ink-mute">
              Every money and config action is attributed and immutable.
            </p>
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
          <span aria-hidden className="size-7 shrink-0 rounded-full bg-line" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13.5px] font-semibold">{row.username}</span>
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
        <span className="font-mono text-sm font-semibold tnum">
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
