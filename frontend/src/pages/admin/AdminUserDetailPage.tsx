import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { StatCard } from '@/components/ui/StatCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { UnderlineTabs } from '@/components/ui/Tabs'
import {
  useAdminUser,
  useSetUserStatus,
  useUserAdjustments,
  useUserDeposits,
  useUserRounds,
} from '@/features/admin'
import { formatClockSeconds, formatDate, formatDateTime, formatMultiplier, formatRelative } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { adminPaths } from '@/routes/paths'

import { WalletAdjustDialog, type AdjustDirection } from './WalletAdjustDialog'

type DetailTab = 'rounds' | 'deposits' | 'adjustments' | 'sessions'

export function AdminUserDetailPage() {
  const { id = '' } = useParams()
  const userQuery = useAdminUser(id)
  const [tab, setTab] = useState<DetailTab>('rounds')
  const [adjusting, setAdjusting] = useState<AdjustDirection | null>(null)
  const [suspending, setSuspending] = useState(false)
  const setStatus = useSetUserStatus()

  if (userQuery.isPending) {
    return <SkeletonRows count={6} />
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

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-ink-mute">
        <Link to={adminPaths.users} className="inline-flex min-h-11 items-center gap-1 hover:text-ink">
          <ChevronLeft aria-hidden size={15} strokeWidth={1.5} />
          Users
        </Link>
        <span aria-hidden>/</span>
        <span className="font-mono text-ink">{user.account_ref}</span>
        <StatusBadge status={user.status} className="ml-2" />
      </nav>

      <div className="grid gap-3.5 sm:grid-cols-2 wide:grid-cols-4">
        <StatCard
          label="Staked 30d"
          value={formatMoney(money(user.staked_30d_minor, user.currency), { decimals: 'trim' })}
        />
        <StatCard
          label="Net 30d"
          value={
            <MoneyDisplay
              value={money(user.net_30d_minor, user.currency)}
              tone="auto"
              sign="always"
              decimals="trim"
              className="text-[26px]"
            />
          }
        />
        <StatCard label="Rounds" value={user.rounds_played} />
        <StatCard label="Deposits approved" value={user.deposits_approved} />
      </div>

      <div className="grid gap-6 wide:grid-cols-[minmax(0,1fr)_340px] wide:items-start">
        <section className="order-2 flex flex-col gap-4 wide:order-1">
          <UnderlineTabs
            items={[
              { id: 'rounds' as const, label: 'Rounds' },
              { id: 'deposits' as const, label: 'Deposits' },
              { id: 'adjustments' as const, label: 'Adjustments' },
              { id: 'sessions' as const, label: 'Sessions' },
            ]}
            value={tab}
            onChange={setTab}
            label="Account history"
          />

          {tab === 'rounds' ? <RoundsTab /> : null}
          {tab === 'deposits' ? <DepositsTab userId={user.id} /> : null}
          {tab === 'adjustments' ? <AdjustmentsTab userId={user.id} /> : null}
          {tab === 'sessions' ? (
            <p className="rounded-card border border-line bg-surface-1 p-5 text-sm text-ink-mute">
              Sessions are opaque server-side records. This tab lists active and revoked sessions with
              their start and end times once the session endpoint is exposed to the console.
            </p>
          ) : null}
        </section>

        <aside className="order-1 flex flex-col gap-5 wide:sticky wide:top-21 wide:order-2">
          <section className="flex flex-col gap-4 rounded-card border border-line bg-panel p-5">
            <div className="flex flex-col gap-1.5">
              <span className="label-mono text-ink-mute">Wallet balance · {user.currency}</span>
              <span className="font-mono text-[30px] leading-none font-semibold tnum">
                {formatMoney(money(user.balance_minor, user.currency))}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Button size="sm" onClick={() => setAdjusting('credit')}>
                Credit
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setAdjusting('debit')}>
                Debit
              </Button>
            </div>

            <dl className="flex flex-col gap-2 border-t border-line pt-3 text-[13px]">
              <Row label="Currency">{user.currency} · fixed</Row>
              <Row label="Last active">{formatRelative(user.last_active_at)}</Row>
            </dl>

            <p className="text-[12px] leading-relaxed text-ink-mute">
              Both open a dialog requiring amount and reason. Every adjustment is written to the
              Adjustments tab with the operator&rsquo;s name — no silent balance edits.
            </p>
          </section>

          <section className="flex flex-col gap-3 rounded-card border border-line bg-panel p-5">
            <h2 className="font-display text-[17px] font-semibold text-ink">Account</h2>
            <dl className="flex flex-col gap-2 text-[13px]">
              <Row label="Account id">
                <span className="font-mono">{user.account_ref}</span>
              </Row>
              <Row label="Username">{user.display_name}</Row>
              <Row label="Email">
                <span className="break-all">{user.email}</span>
              </Row>
              <Row label="Registered">{formatDate(user.created_at)}</Row>
              <Row label="Verified">{user.verified}</Row>
            </dl>
          </section>

          <section className="flex flex-col gap-2.5 rounded-card border border-danger/28 bg-danger/5 p-5">
            <h2 className="font-display text-[15px] font-semibold text-ink">Account controls</h2>
            <Button variant="secondary" size="sm" fullWidth>
              Reset password
            </Button>
            <Button variant="destructive" size="sm" fullWidth onClick={() => setSuspending(true)}>
              {suspended ? 'Reinstate account' : 'Suspend account'}
            </Button>
          </section>
        </aside>
      </div>

      <WalletAdjustDialog
        user={adjusting ? user : null}
        direction={adjusting ?? 'credit'}
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
        onClose={() => setSuspending(false)}
        onConfirm={async () => {
          await setStatus.mutateAsync({ id: user.id, status: suspended ? 'active' : 'suspended' })
          setSuspending(false)
        }}
      />
    </div>
  )
}

function RoundsTab() {
  const roundsQuery = useUserRounds('')

  if (roundsQuery.isPending) {
    return <SkeletonRows count={5} />
  }

  return (
    <RecordTable
      label="Rounds"
      rows={roundsQuery.data ?? []}
      rowKey={(row) => row.id}
      columns={[
        {
          key: 'time',
          header: 'Time',
          width: '130px',
          cell: (row) => (
            <span className="font-mono text-[12.5px] text-ink-mute">
              {formatClockSeconds(row.created_at)}
            </span>
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
          meta={`${formatClockSeconds(row.created_at)} · ${formatMoney(money(row.stake_minor, row.currency))}`}
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
  )
}

function DepositsTab({ userId }: { userId: string }) {
  const depositsQuery = useUserDeposits(userId)

  if (depositsQuery.isPending) {
    return <SkeletonRows count={4} />
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
