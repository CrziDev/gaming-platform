import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import type { Wallet } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ChipTabs } from '@/components/ui/Tabs'
import {
  useAdminUser,
  useAdminUserWallets,
  useSetUserStatus,
  useUserAdjustments,
  useUserDeposits,
} from '@/features/admin'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { adminPaths } from '@/routes/paths'

import { WalletAdjustDialog, type AdjustDirection } from './WalletAdjustDialog'

type DetailTab = 'deposits' | 'adjustments'
type AdjustmentTarget = {
  direction: AdjustDirection
  wallet: Wallet
}

export function AdminUserDetailPage() {
  const { id = '' } = useParams()
  const userQuery = useAdminUser(id)
  const walletsQuery = useAdminUserWallets(id)
  const [tab, setTab] = useState<DetailTab>('deposits')
  const [adjusting, setAdjusting] = useState<AdjustmentTarget | null>(null)
  const [suspending, setSuspending] = useState(false)
  const setStatus = useSetUserStatus()

  if (userQuery.isPending) {
    return <SkeletonRows count={6} />
  }

  if (userQuery.isError) {
    return (
      <ErrorState
        title="Account unavailable"
        message="The account could not be loaded."
        onRetry={() => void userQuery.refetch()}
      />
    )
  }

  const user = userQuery.data
  if (!user) {
    return (
      <EmptyState
        title="Account not found"
        description="This account is no longer in the directory."
        action={
          <Link to={adminPaths.users} className="text-accent hover:underline">
            Back to users
          </Link>
        }
      />
    )
  }

  const suspended = user.status === 'suspended'
  const accountReference = user.id.slice(0, 8).toUpperCase()
  const wallets = walletsQuery.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-ink-mute">
        <Link to={adminPaths.users} className="inline-flex min-h-11 items-center gap-1 hover:text-ink">
          <ChevronLeft aria-hidden size={15} strokeWidth={1.5} />
          Users
        </Link>
        <span aria-hidden>/</span>
        <span className="font-mono text-ink">{accountReference}</span>
        <StatusBadge status={user.status} className="ml-2" />
      </nav>

      {walletsQuery.isPending ? (
        <SkeletonRows count={2} />
      ) : walletsQuery.isError ? (
        <ErrorState
          title="Wallets unavailable"
          message="The account wallets could not be loaded."
          onRetry={() => void walletsQuery.refetch()}
        />
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 wide:grid-cols-4">
          {wallets.map((wallet) => (
            <StatCard
              key={wallet.currency}
              label={`${wallet.currency} wallet`}
              value={formatMoney(money(wallet.balance_minor, wallet.currency), { decimals: 'trim' })}
            />
          ))}
        </div>
      )}

      <div className="grid gap-6 wide:grid-cols-[minmax(0,1fr)_340px] wide:items-start">
        <section className="order-2 flex flex-col gap-4 wide:order-1">
          <ChipTabs
            items={[
              { id: 'deposits' as const, label: 'Deposits' },
              { id: 'adjustments' as const, label: 'Adjustments' },
            ]}
            value={tab}
            onChange={setTab}
            label="Account history"
          />

          {tab === 'deposits' ? <DepositsTab userId={user.id} /> : null}
          {tab === 'adjustments' ? <AdjustmentsTab userId={user.id} /> : null}
        </section>

        <aside className="order-1 flex flex-col gap-5 wide:sticky wide:top-21 wide:order-2">
          <section className="flex flex-col gap-4 rounded-card bg-panel p-5">
            <h2 className="text-[17px] font-semibold text-ink">Wallets</h2>
            {wallets.map((wallet) => (
              <div key={wallet.currency} className="flex flex-col gap-3 pb-4 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="label-mono text-ink-mute">{wallet.currency}</span>
                  <span className="font-mono text-xl font-semibold tnum">
                    {formatMoney(money(wallet.balance_minor, wallet.currency))}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button size="sm" onClick={() => setAdjusting({ direction: 'credit', wallet })}>
                    Credit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAdjusting({ direction: 'debit', wallet })}
                  >
                    Debit
                  </Button>
                </div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3 rounded-card bg-panel p-5">
            <h2 className="text-[17px] font-semibold text-ink">Account</h2>
            <dl className="flex flex-col gap-2 text-[13px]">
              <Row label="Account id">
                <span className="font-mono">{accountReference}</span>
              </Row>
              <Row label="Username">{user.display_name}</Row>
              <Row label="Email">
                <span className="break-all">{user.email}</span>
              </Row>
              <Row label="Registered">{formatDate(user.created_at)}</Row>
            </dl>
          </section>

          <section className="flex flex-col gap-2.5 rounded-card bg-danger/5 p-5">
            <h2 className="text-[15px] font-semibold text-ink">Account controls</h2>
            {user.status === 'closed' ? (
              <p className="text-[12.5px] leading-relaxed text-ink-mute">
                This account is permanently closed. Its status cannot be changed.
              </p>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                fullWidth
                onClick={() => {
                  setStatus.reset()
                  setSuspending(true)
                }}
              >
                {suspended ? 'Reinstate account' : 'Suspend account'}
              </Button>
            )}
          </section>
        </aside>
      </div>

      <WalletAdjustDialog
        user={adjusting ? user : null}
        wallet={adjusting?.wallet ?? null}
        direction={adjusting?.direction ?? 'credit'}
        onClose={() => setAdjusting(null)}
      />

      <ConfirmDialog
        open={suspending}
        title={suspended ? 'Reinstate this account?' : 'Suspend this account?'}
        description={
          suspended
            ? 'The player can sign in, play and deposit again immediately.'
            : 'The player is signed out everywhere and cannot sign in, play or deposit. Their balance is untouched.'
        }
        confirmLabel={suspended ? 'Reinstate' : 'Suspend'}
        tone={suspended ? 'primary' : 'destructive'}
        pending={setStatus.isPending}
        onClose={() => {
          setSuspending(false)
          setStatus.reset()
        }}
        onConfirm={async () => {
          try {
            await setStatus.mutateAsync({ id: user.id, status: suspended ? 'active' : 'suspended' })
            setSuspending(false)
          } catch {
            // The dialog remains open and the mutation error is shown below it.
          }
        }}
      >
        {setStatus.isError ? (
          <p role="alert" className="text-sm text-danger">
            The account status could not be changed. Refresh the account and try again.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}

function DepositsTab({ userId }: { userId: string }) {
  const depositsQuery = useUserDeposits(userId)

  if (depositsQuery.isPending) {
    return <SkeletonRows count={4} />
  }

  if (depositsQuery.isError) {
    return (
      <ErrorState
        title="Deposits unavailable"
        message="The account deposits could not be loaded."
        onRetry={() => void depositsQuery.refetch()}
      />
    )
  }

  if ((depositsQuery.data ?? []).length === 0) {
    return <EmptyState title="No deposits" description="This account has never submitted a request." />
  }

  return (
    <RecordTable
      label="Deposits"
      rows={depositsQuery.data ?? []}
      rowKey={(row) => row.id}
      columns={[
        {
          key: 'date',
          header: 'Submitted',
          cell: (row) => (
            <span className="text-[13px] text-ink-mute">{formatDateTime(row.created_at)}</span>
          ),
        },
        {
          key: 'reference',
          header: 'Reference',
          cell: (row) => <span className="font-mono text-[13px]">{row.reference}</span>,
        },
        { key: 'method', header: 'Method', cell: (row) => row.method_name },
        { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
        {
          key: 'amount',
          header: 'Amount',
          align: 'right',
          width: '150px',
          cell: (row) => (
            <span className="font-mono text-sm font-semibold tnum">
              {formatMoney(money(row.amount_minor, row.currency))}
            </span>
          ),
        },
      ]}
      renderCard={(row) => (
        <RecordCard
          title={row.method_name}
          meta={`${row.reference} · ${formatRelative(row.created_at)}`}
          value={
            <span className="font-mono text-sm font-semibold tnum">
              {formatMoney(money(row.amount_minor, row.currency))}
            </span>
          }
          aside={<StatusBadge status={row.status} />}
        />
      )}
    />
  )
}

function AdjustmentsTab({ userId }: { userId: string }) {
  const adjustmentsQuery = useUserAdjustments(userId)

  if (adjustmentsQuery.isPending) {
    return <SkeletonRows count={3} />
  }

  if (adjustmentsQuery.isError) {
    return (
      <ErrorState
        title="Adjustments unavailable"
        message="The wallet adjustments could not be loaded."
        onRetry={() => void adjustmentsQuery.refetch()}
      />
    )
  }

  if ((adjustmentsQuery.data ?? []).length === 0) {
    return (
      <EmptyState
        title="No adjustments"
        description="Nobody has credited or debited this wallet by hand."
      />
    )
  }

  return (
    <>
      <RecordTable
        label="Adjustments"
        rows={adjustmentsQuery.data ?? []}
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'date',
            header: 'When',
            cell: (row) => (
              <span className="text-[13px] text-ink-mute">{formatDateTime(row.created_at)}</span>
            ),
          },
          { key: 'reason', header: 'Reason', cell: (row) => row.reason },
          { key: 'operator', header: 'Operator', cell: (row) => row.operator },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            width: '150px',
            cell: (row) => (
              <MoneyDisplay value={money(row.amount_minor, row.currency)} tone="auto" sign="always" />
            ),
          },
        ]}
        renderCard={(row) => (
          <RecordCard
            title={row.reason}
            meta={`${row.operator} · ${formatRelative(row.created_at)}`}
            value={
              <MoneyDisplay
                value={money(row.amount_minor, row.currency)}
                tone="auto"
                sign="always"
                className="text-sm"
              />
            }
          />
        )}
      />
      <p className="font-mono text-[10.5px] text-ink-mute">
        Append-only. No edit, no delete — this is the audit trail.
      </p>
    </>
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
