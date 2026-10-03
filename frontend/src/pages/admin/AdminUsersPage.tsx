import { useState } from 'react'
import { useNavigate } from 'react-router'

import type { AdminUser } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Avatar } from '@/components/ui/Avatar'
import { PageNav } from '@/components/ui/PageNav'
import { Input } from '@/components/ui/Field'
import { RecordCard, RecordTable, type Column } from '@/components/ui/RecordTable'
import { SegmentedTrack } from '@/components/ui/Tabs'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAdminUsers, useUserCounts, type UserFilter } from '@/features/admin'
import { formatRelative } from '@/lib/format'

export function AdminUsersPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<UserFilter>({ status: 'all', search: '', page: 1 })
  const usersQuery = useAdminUsers(filter)
  const countsQuery = useUserCounts()

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
      </div>

      {usersQuery.isPending ? (
        <SkeletonRows count={8} />
      ) : usersQuery.isError ? (
        <ErrorState
          title="Accounts unavailable"
          message="The account list could not be loaded."
          onRetry={() => void usersQuery.refetch()}
        />
      ) : !page || page.rows.length === 0 ? (
        <EmptyState title="No accounts match" description="Try a different search or filter." />
      ) : (
        <RecordTable
          label="Account records"
          columns={columns}
          rows={page.rows}
          rowKey={(row) => row.id}
          renderCard={(row) => (
            <RecordCard
              title={row.display_name}
              meta={<span className="block truncate">{row.email}</span>}
              aside={<StatusBadge status={row.status} />}
              value={
                <span className="text-[12px] text-ink-mute">
                  Joined {formatRelative(row.created_at)}
                </span>
              }
              leading={<Avatar name={row.display_name} className="size-9 text-[11px]" />}
              onClick={() => void navigate(`/admin/users/${row.id}`)}
            />
          )}
          onRowClick={(row) => void navigate(`/admin/users/${row.id}`)}
          footer={
            <PageNav
              page={page.page}
              pages={page.pages}
              size={page.size}
              total={page.total}
              onChange={(next) => setFilter((current) => ({ ...current, page: next }))}
            />
          }
        />
      )}
    </div>
  )
}

function accountReference(user: AdminUser): string {
  return user.id.slice(0, 8).toUpperCase()
}

const columns: Column<AdminUser>[] = [
  {
    key: 'player',
    header: 'Player',
    cell: (row) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={row.display_name} className="size-8 text-[10.5px]" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13.5px] font-medium text-ink-soft">{row.display_name}</span>
          <span className="truncate font-mono text-[11px] text-ink-mute">{accountReference(row)}</span>
        </span>
      </span>
    ),
  },
  {
    key: 'email',
    header: 'Email',
    cell: (row) => <span className="text-[13px] text-ink-mute">{row.email}</span>,
  },
  {
    key: 'registered',
    header: 'Registered',
    width: '150px',
    columnClass: 'hidden xl:table-cell',
    cell: (row) => <span className="text-[13px] text-ink-mute">{formatRelative(row.created_at)}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    width: '130px',
    cell: (row) => <StatusBadge status={row.status} />,
  },
]
