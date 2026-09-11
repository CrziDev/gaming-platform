import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import type { Transaction } from '@/api/types'
import { buttonStyles } from '@/components/ui/Button'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useActiveWallet, useDeposits, useTransactions } from '@/features/wallet'
import { formatDateTime, formatRelative } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function WalletPage() {
  const walletQuery = useActiveWallet()
  const depositsQuery = useDeposits()
  const historyQuery = useTransactions({ kind: 'all', days: 30, page: 1 })

  const pending = depositsQuery.data?.find((deposit) => deposit.status === 'pending')
  const recent = historyQuery.data?.rows.slice(0, 5) ?? []

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">Wallet</h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-5 rounded-card bg-panel p-6 sm:flex-row sm:items-end sm:justify-between">
            {walletQuery.data ? (
              <div className="flex flex-col gap-2">
                <span className="label-mono text-ink-mute">
                  Available balance · {walletQuery.data.currency}
                </span>
                <span className="font-mono text-[36px] leading-none font-semibold tracking-tight tnum wide:text-[44px]">
                  {formatMoney(money(walletQuery.data.balance_minor, walletQuery.data.currency))}
                </span>
                <span className="text-[13px] text-ink-mute">
                  One wallet · currency fixed at registration
                </span>
              </div>
            ) : (
              <Skeleton className="h-20 w-64" />
            )}

            <div className="flex flex-col gap-2 sm:min-w-50">
              <Link to={paths.deposit} className={buttonStyles('primary', 'md', true)}>
                <Plus aria-hidden size={17} strokeWidth={2} />
                Deposit
              </Link>
              <span className="text-center font-mono text-[10.5px] text-ink-mute">
                slot grid · 1 of max 3
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">Recent activity</h2>
              <Link to={paths.history} className="text-[13px] text-accent hover:underline">
                Open full history
              </Link>
            </div>

            {historyQuery.isPending ? (
              <SkeletonRows count={4} />
            ) : recent.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Your stakes, wins and deposits appear here as soon as they settle."
              />
            ) : (
              <RecordTable
                label="Recent wallet activity"
                columns={ledgerColumns}
                rows={recent}
                rowKey={(row) => row.id}
                renderCard={(row) => (
                  <RecordCard
                    title={row.label}
                    meta={`${row.reference} · ${formatRelative(row.created_at)}`}
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
                )}
              />
            )}
          </section>
        </div>

        {pending ? (
          <section className="flex flex-col gap-4 rounded-card bg-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-semibold text-ink">Open request</h2>
              <StatusBadge status="Pending review" tone="warning" />
            </div>

            <dl className="flex flex-col gap-2.5 text-[13.5px]">
              <Row label="Amount">
                <span className="font-mono font-semibold tnum">
                  {formatMoney(money(pending.amount_minor, pending.currency))}
                </span>
              </Row>
              <Row label="Method">{pending.method_name}</Row>
              <Row label="Reference">
                <span className="font-mono">{pending.reference}</span>
              </Row>
              <Row label="Submitted">{formatRelative(pending.created_at)}</Row>
            </dl>

            <p className="text-[12.5px] leading-relaxed text-ink-mute">
              Submitted requests cannot be cancelled. Balance updates only on admin approval — pending
              amounts are never spendable.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-mute">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  )
}

const ledgerColumns: Column<Transaction>[] = [
  { key: 'type', header: 'Type', cell: (row) => row.label },
  {
    key: 'reference',
    header: 'Reference',
    cell: (row) => <span className="font-mono text-[13px] text-ink-mute">{row.reference}</span>,
  },
  { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'date',
    header: 'Date',
    cell: (row) => <span className="text-[13px] text-ink-mute">{formatDateTime(row.created_at)}</span>,
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    width: '150px',
    cell: (row) => (
      <MoneyDisplay value={money(row.amount_minor, row.currency)} tone="auto" sign="always" />
    ),
  },
]
