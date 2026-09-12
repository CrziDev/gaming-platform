import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button, buttonStyles } from '@/components/ui/Button'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  SwitchCurrencyDialog,
  ledgerColumns,
  useActiveCurrency,
  useActiveWallet,
  usePendingDeposits,
  useTransactions,
  useWallets,
} from '@/features/wallet'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function WalletPage() {
  const currency = useActiveCurrency()
  const walletQuery = useActiveWallet()
  const walletsQuery = useWallets()
  const pendingQuery = usePendingDeposits()
  const historyQuery = useTransactions({ kind: 'all', days: 30, page: 1, currency })
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)

  const pending = pendingQuery.data ?? []
  const recent = historyQuery.data?.rows.slice(0, 5) ?? []
  const canSwitch = (walletsQuery.data?.length ?? 0) > 1

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Wallet</h1>

      <section className="flex flex-col gap-5 rounded-card bg-surface-1 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="label-mono text-ink-mute">Available balance · {currency}</span>
            {canSwitch ? (
              <Button variant="secondary" size="sm" onClick={() => setSwitching(true)}>
                Switch currency
              </Button>
            ) : null}
          </div>
          {walletQuery.data ? (
            <span className="font-mono text-[32px] leading-none font-medium tracking-[-0.02em] text-ink tnum wide:text-[40px]">
              {formatMoney(money(walletQuery.data.balance_minor, walletQuery.data.currency))}
            </span>
          ) : walletQuery.isError ? (
            <ErrorState
              title="Balance unavailable"
              message="Your balance could not be loaded."
              onRetry={() => void walletQuery.refetch()}
            />
          ) : (
            <Skeleton className="h-10 w-48" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Link to={paths.deposit} className={cn(buttonStyles('primary', 'md'), 'sm:px-5')}>
            <Plus aria-hidden size={17} strokeWidth={2} />
            Deposit
          </Link>
          <Link to={paths.cashOut} className={cn(buttonStyles('secondary', 'md'), 'sm:px-5')}>
            Cash out
          </Link>
        </div>
      </section>

      <div
        className={cn(
          'grid gap-6',
          pending.length > 0 && 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start',
        )}
      >
        {pending.length > 0 ? (
          <section className="flex flex-col gap-3 lg:order-2">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">
              Open requests · {pending.length}
            </h2>
            <div className="flex flex-col gap-0.5">
              {pending.map((request) => (
                <RecordCard
                  key={request.id}
                  title={`${formatMoney(money(request.amount_minor, request.currency))} · ${request.method_name}`}
                  meta={`Ref ${request.reference} · ${formatRelative(request.created_at)}`}
                  aside={<StatusBadge status="pending" />}
                  onClick={() => void navigate(paths.depositStatus(request.id))}
                />
              ))}
            </div>
            <p className="text-[12.5px] leading-relaxed text-ink-mute">
              Pending amounts aren&rsquo;t spendable until an admin approves. Requests can&rsquo;t be
              cancelled.
            </p>
          </section>
        ) : null}

        <section className="flex flex-col gap-3 lg:order-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">Recent activity</h2>
            <Link to={paths.history} className="text-[12.5px] font-medium text-accent-ink hover:text-accent-hi">
              Open full history
            </Link>
          </div>

          {historyQuery.isPending ? (
            <SkeletonRows count={4} />
          ) : historyQuery.isError ? (
            <ErrorState
              title="Activity unavailable"
              message="Recent movements could not be loaded. Your balance above is unaffected."
              onRetry={() => void historyQuery.refetch()}
            />
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

      <SwitchCurrencyDialog open={switching} onClose={() => setSwitching(false)} />
    </div>
  )
}
