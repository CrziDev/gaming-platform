import { Megaphone, Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { AdminAnnouncement } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { PageNav } from '@/components/ui/PageNav'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  useAdminAnnouncements,
  useSetAnnouncementStatus,
} from '@/features/announcement'
import { formatDate } from '@/lib/format'

import { AnnouncementFormDialog } from './AnnouncementFormDialog'

export function AdminAnnouncementsPage() {
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminAnnouncement | undefined>(undefined)
  const [statusError, setStatusError] = useState<string | undefined>(undefined)
  const [now, setNow] = useState(0)
  const announcementsQuery = useAdminAnnouncements(page)
  const statusMutation = useSetAnnouncementStatus()
  const result = announcementsQuery.data

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const interval = window.setInterval(tick, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const newAnnouncement = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <Plus aria-hidden size={15} strokeWidth={2} />
      New announcement
    </Button>
  )

  const toggle = async (item: AdminAnnouncement) => {
    setStatusError(undefined)
    try {
      await statusMutation.mutateAsync({ id: item.id, enabled: !item.enabled })
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'The announcement could not be updated.')
    }
  }

  const actions = (item: AdminAnnouncement) => {
    const ended = item.ends_at !== null && Date.parse(item.ends_at) <= now
    return (
      <>
        <Button variant="secondary" size="sm" onClick={() => setEditing(item)}>
          <Pencil aria-hidden size={14} strokeWidth={1.5} />
          Edit
        </Button>
        <Button
          variant={item.enabled ? 'destructive' : 'secondary'}
          size="sm"
          disabled={statusMutation.isPending || (!item.enabled && ended)}
          title={!item.enabled && ended ? 'Set a future end date before enabling' : undefined}
          onClick={() => void toggle(item)}
        >
          {item.enabled ? 'Disable' : 'Enable'}
        </Button>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Announcements"
        meta="Messages published here appear in the lobby announcement bar."
        actions={newAnnouncement}
      />

      {statusError ? (
        <p role="alert" className="rounded-card bg-danger/12 px-4 py-3 text-[13px] text-danger">
          {statusError}
        </p>
      ) : null}

      {announcementsQuery.isPending ? (
        <SkeletonRows count={6} />
      ) : announcementsQuery.isError ? (
        <ErrorState
          title="Announcements unavailable"
          message="The announcements could not be loaded."
          onRetry={() => void announcementsQuery.refetch()}
        />
      ) : !result || result.rows.length === 0 ? (
        <EmptyState
          title="No announcements yet"
          description="Publish a message to show an announcement bar on the lobby."
          action={newAnnouncement}
        />
      ) : (
        <RecordTable
          label="Announcements"
          rows={result.rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'announcement',
              header: 'Announcement',
              cell: (row) => <span className="text-[13.5px] text-ink-soft">{row.text}</span>,
            },
            {
              key: 'duration',
              header: 'Duration',
              width: '180px',
              cell: (row) => (
                <span className="font-mono text-[12px] text-ink-mute">
                  {row.ends_at === null ? 'Permanent' : `Ends ${formatDate(row.ends_at)}`}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              width: '120px',
              cell: (row) => <StatusBadge status={announcementStatus(row, now)} />,
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              width: '210px',
              cell: (row) => <span className="flex justify-end gap-2">{actions(row)}</span>,
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              leading={<Megaphone aria-hidden size={16} strokeWidth={1.5} className="text-ink-mute" />}
              title={row.text}
              meta={row.ends_at === null ? 'Permanent' : `Ends ${formatDate(row.ends_at)}`}
              aside={<StatusBadge status={announcementStatus(row, now)} />}
              actions={actions(row)}
            />
          )}
          footer={
            <PageNav
              page={result.page}
              pages={result.pages}
              size={result.size}
              total={result.total}
              onChange={setPage}
              unit="announcements"
            />
          }
        />
      )}

      <AnnouncementFormDialog open={creating} onClose={() => setCreating(false)} />
      <AnnouncementFormDialog
        open={editing !== undefined}
        {...(editing ? { announcement: editing } : {})}
        onClose={() => setEditing(undefined)}
      />
    </div>
  )
}

function announcementStatus(item: AdminAnnouncement, now: number): 'active' | 'inactive' | 'expired' {
  if (!item.enabled) return 'inactive'
  if (item.ends_at !== null && Date.parse(item.ends_at) <= now) return 'expired'
  return 'active'
}
