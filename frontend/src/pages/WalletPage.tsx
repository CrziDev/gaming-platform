import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button, buttonStyles } from '@/components/ui/Button'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SeeAll } from '@/components/ui/SeeAll'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ChipTabs, type TabItem } from '@/components/ui/Tabs'
import {
  LedgerStatus,
  SwitchCurrencyDialog,
  depositColumns,
  ledgerColumns,
  useActiveCurrency,
  useActiveWallet,
  useDeposits,
  useTransactions,
  useWallets,
  useWithdrawals,
  withdrawalColumns,
} from '@/features/wallet'
import { formatRelative } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

type RecordTab = 'activity' | 'withdrawals' | 'deposits'

export function WalletPage() {
  const currency = useActiveCurrency()
  const walletQuery = useActiveWallet()
  const walletsQuery = useWallets()
  const [switching, setSwitching] = useState(false)
  const [tab, setTab] = useState<RecordTab>('activity')
  const depositsQuery = useDeposits()
  const withdrawalsQuery = useWithdrawals()

  const canSwitch = (walletsQuery.data?.length ?? 0) > 1
  const tabs: TabItem<RecordTab>[] = [
    { id: 'activity', label: 'Activity' },
    { id: 'withdrawals', label: 'Withdrawals', count: pendingCount(withdrawalsQuery.data) },
    { id: 'deposits', label: 'Deposits', count: pendingCount(depositsQuery.data) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[20px] font-bold tracking-[-0.02em] text-ink">Wallet</h1>

      <section className="flex flex-col gap-2 rounded-card glass-panel p-4 sm:p-5">
        {canSwitch ? (
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setSwitching(true)}>
              Switch currency
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col items-center gap-2">
            <span className="label-mono text-ink-cool">Available balance · {currency}</span>
            {walletQuery.data ? (
              <span className="text-[28px] leading-none font-medium tracking-[-0.02em] text-ink tnum wide:text-[34px]">
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

          <div className="grid w-full max-w-sm grid-cols-2 gap-2">
            <Link to={paths.deposit} className={buttonStyles('primary', 'md')}>
              <Plus aria-hidden size={17} strokeWidth={2} />
              Deposit
            </Link>
            <Link to={paths.cashOut} className={buttonStyles('secondary', 'md')}>
              Cash out
            </Link>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <ChipTabs items={tabs} value={tab} onChange={setTab} label="Wallet records" />

        {tab === 'activity' ? (
          <ActivityTab />
        ) : tab === 'withdrawals' ? (
          <WithdrawalsTab query={withdrawalsQuery} />
        ) : (
          <DepositsTab query={depositsQuery} />
        )}
      </section>

      <SwitchCurrencyDialog open={switching} onClose={() => setSwitching(false)} />
    </div>
  )
}

function pendingCount(requests: { status: string }[] | undefined): number | undefined {
  const count = requests?.filter((request) => request.status === 'pending').length ?? 0
  return count > 0 ? count : undefined
}

function ActivityTab() {
  const currency = useActiveCurrency()
  const historyQuery = useTransactions({ kind: 'all', days: 30, page: 1, currency })
  const recent = historyQuery.data?.rows.slice(0, 5) ?? []

  if (historyQuery.isPending) return <SkeletonRows count={4} />
  if (historyQuery.isError) {
    return (
      <ErrorState
        title="Activity unavailable"
        message="Recent activity could not be loaded."
        onRetry={() => void historyQuery.refetch()}
      />
    )
  }
  if (recent.length === 0) {
    return <EmptyState title="No activity yet" description="Your deposits, bets and wins will appear here." />
  }

  return (
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
            <MoneyDisplay value={money(row.amount_minor, row.currency)} tone="auto" sign="always" className="text-sm" />
          }
          aside={<LedgerStatus status={row.status} />}
        />
      )}
      footer={
        <div className="flex justify-end">
          <SeeAll to={paths.history} subject="history" />
        </div>
      }
    />
  )
}

function WithdrawalsTab({ query }: { query: ReturnType<typeof useWithdrawals> }) {
  const navigate = useNavigate()

  if (query.isPending) return <SkeletonRows count={3} />
  if (query.isError) {
    return (
      <ErrorState
        title="Withdrawals unavailable"
        message="Your withdrawals could not be loaded."
        onRetry={() => void query.refetch()}
      />
    )
  }
  if (query.data.length === 0) {
    return <EmptyState title="No withdrawals yet" description="Your cash-out requests will appear here." />
  }

  return (
    <RecordTable
      label="Withdrawal requests"
      columns={withdrawalColumns}
      rows={query.data}
      rowKey={(row) => row.id}
      onRowClick={(row) => void navigate(paths.withdrawalStatus(row.id))}
      renderCard={(row) => (
        <RecordCard
          title={`${formatMoney(money(row.amount_minor, row.currency))} · ${row.method_name}`}
          meta={formatRelative(row.created_at)}
          aside={<StatusBadge status={row.status} />}
          onClick={() => void navigate(paths.withdrawalStatus(row.id))}
        />
      )}
    />
  )
}

function DepositsTab({ query }: { query: ReturnType<typeof useDeposits> }) {
  const navigate = useNavigate()

  if (query.isPending) return <SkeletonRows count={3} />
  if (query.isError) {
    return (
      <ErrorState
        title="Deposits unavailable"
        message="Your deposits could not be loaded."
        onRetry={() => void query.refetch()}
      />
    )
  }
  if (query.data.length === 0) {
    return <EmptyState title="No deposits yet" description="Your deposit requests will appear here." />
  }

  return (
    <RecordTable
      label="Deposit requests"
      columns={depositColumns}
      rows={query.data}
      rowKey={(row) => row.id}
      onRowClick={(row) => void navigate(paths.depositStatus(row.id))}
      renderCard={(row) => (
        <RecordCard
          title={`${formatMoney(money(row.amount_minor, row.currency))} · ${row.method_name}`}
          meta={`Ref ${row.reference} · ${formatRelative(row.created_at)}`}
          aside={<StatusBadge status={row.status} />}
          onClick={() => void navigate(paths.depositStatus(row.id))}
        />
      )}
      footer={
        query.data.some((request) => request.status === 'pending') ? (
          <p className="text-[12.5px] leading-relaxed text-ink-mute">Funds are added once a request is approved.</p>
        ) : null
      }
    />
  )
}
