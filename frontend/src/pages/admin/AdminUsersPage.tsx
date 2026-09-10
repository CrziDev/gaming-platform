import { useState } from 'react'
import { Download, Plus } from 'lucide-react'
import { useNavigate } from 'react-router'

import type { AdminUserRecord } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SegmentedTrack } from '@/components/ui/Tabs'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAdminUsers, useUserCounts, type UserFilter } from '@/features/admin'
import { formatRelative } from '@/lib/format'
import { formatMoney, money } from '@/lib/money'
import { adminPaths } from '@/routes/paths'

import { WalletAdjustDialog, type AdjustDirection } from './WalletAdjustDialog'

export function AdminUsersPage() {
  const [filter, setFilter] = useState<UserFilter>({ status: 'all', search: '', page: 1 })
  const usersQuery = useAdminUsers(filter)
  const countsQuery = useUserCounts()
  const navigate = useNavigate()

  const [adjusting, setAdjusting] = useState<{
    user: AdminUserRecord
    direction: AdjustDirection
  } | null>(null)

  const page = usersQuery.data
  const counts = countsQuery.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Users"
        meta={
          counts
            ? `${counts.all} accounts · ${counts.active} active · ${counts.suspended} suspended`
            : undefined
        }
        actions={
          <>
            <Button variant="secondary" size="sm" className="hidden lg:inline-flex">
              <Download aria-hidden size={15} strokeWidth={1.5} />
              Export CSV
            </Button>
            <Button size="sm">
              <Plus aria-hidden size={15} strokeWidth={2} />
              Add user
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedTrack
          items={[
            { id: 'all' as const, label: 'All', count: counts?.all },
            { id: 'active' as const, label: 'Active', count: counts?.active },
            { id: 'suspended' as const, label: 'Suspended', count: counts?.suspended },
          ]}
          value={filter.status}
          onChange={(status) => setFilter((current) => ({ ...current, status, page: 1 }))}
          label="Filter by status"
        />

        <Input
          type="search"
          placeholder="Search name, email or id"
          aria-label="Search users"
          value={filter.search}
          onChange={(event) =>
            setFilter((current) => ({ ...current, search: event.target.value, page: 1 }))
          }
          className="max-w-72 flex-1"
        />

        <Select aria-label="Sort users" className="ml-auto hidden max-w-52 lg:block">
          <option>Sort: Last active</option>
          <option>Sort: Balance</option>
          <option>Sort: Registered</option>
        </Select>
      </div>

      {usersQuery.isPending ? (
        <SkeletonRows count={8} />
      ) : !page || page.rows.length === 0 ? (
        <EmptyState title="No accounts match" description="Clear the filter or widen the search." />
      ) : (
        <RecordTable
          label="Player accounts"
          columns={columns}
          rows={page.rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => void navigate(adminPaths.user(row.id))}
          renderCard={(row) => (
            <RecordCard
              dimmed={row.status === 'suspended'}
              onClick={() => void navigate(adminPaths.user(row.id))}
              title={row.display_name}
              meta={row.account_ref}
              aside={<StatusBadge status={row.status} />}
              value={
                <span className="font-mono text-sm font-semibold tnum">
                  {formatMoney(money(row.balance_minor, row.currency))}
                </span>
              }
              leading={<span aria-hidden className="size-9 shrink-0 rounded-full bg-line" />}
              actions={
                row.status === 'suspended' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      void navigate(adminPaths.user(row.id))
                    }}
                    className="col-span-2"
                  >
                    Open account
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        setAdjusting({ user: row, direction: 'credit' })
                      }}
                    >
                      Credit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        setAdjusting({ user: row, direction: 'debit' })
                      }}
                    >
                      Debit
                    </Button>
                  </>
                )
              }
            />
          )}
          footer={
            <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
              <span className="font-mono text-[12px] text-ink-mute">
                {(page.page - 1) * page.size + 1}–{Math.min(page.page * page.size, page.total)} of{' '}
                {page.total}
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page.page === 1}
                  onClick={() => setFilter((current) => ({ ...current, page: current.page - 1 }))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page.page >= page.pages}
                  onClick={() => setFilter((current) => ({ ...current, page: current.page + 1 }))}
                >
                  Next
                </Button>
              </div>
            </nav>
          }
        />
      )}

      <WalletAdjustDialog
        user={adjusting?.user ?? null}
        direction={adjusting?.direction ?? 'credit'}
        onClose={() => setAdjusting(null)}
      />
    </div>
  )
}

const columns: Column<AdminUserRecord>[] = [
  {
    key: 'player',
    header: 'Player',
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <span aria-hidden className="size-8 shrink-0 rounded-full bg-line" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13.5px] font-semibold">{row.display_name}</span>
          <span className="truncate font-mono text-[11px] text-ink-mute">{row.account_ref}</span>
        </span>
      </span>
    ),
  },
  {
    key: 'balance',
    header: 'Balance',
    align: 'right',
    width: '150px',
    cell: (row) => (
      <span className="font-mono text-sm font-semibold tnum">
        {formatMoney(money(row.balance_minor, row.currency))}
      </span>
    ),
  },
  {
    key: 'staked',
    header: 'Staked 30d',
    align: 'right',
    width: '150px',
    columnClass: 'hidden xl:table-cell',
    cell: (row) => (
      <span className="font-mono text-sm tnum text-ink-mute">
        {formatMoney(money(row.staked_30d_minor, row.currency))}
      </span>
    ),
  },
  {
    key: 'active',
    header: 'Last active',
    width: '150px',
    cell: (row) => <span className="text-[13px] text-ink-mute">{formatRelative(row.last_active_at)}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    width: '130px',
    cell: (row) => <StatusBadge status={row.status} />,
  },
]
