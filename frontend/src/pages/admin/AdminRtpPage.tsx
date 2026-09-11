import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'

import type { RtpProfile } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useRtpProfiles } from '@/features/admin'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime, formatPercent } from '@/lib/format'

const NEGATIVE_MARGIN = 10_000

export function AdminRtpPage() {
  const profilesQuery = useRtpProfiles()
  const [activating, setActivating] = useState<RtpProfile | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="RTP profiles"
        meta="Draft → Verified → Active → Retired. A value is not valid until the engine has verified it."
      />

      <p className="flex items-start gap-3 rounded-card bg-danger/6 px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft">
        <AlertTriangle aria-hidden size={17} strokeWidth={1.5} className="mt-0.5 shrink-0 text-danger" />
        A profile at or above 100% is a negative-margin configuration. It requires a scheduled end time
        and a typed confirmation before it can go live.
      </p>

      {profilesQuery.isPending ? (
        <SkeletonRows count={5} />
      ) : (
        <RecordTable
          label="RTP profiles"
          rows={profilesQuery.data ?? []}
          rowKey={(row) => row.id}
          columns={[
            { key: 'game', header: 'Game', cell: (row) => row.game_name },
            {
              key: 'value',
              header: 'Value',
              align: 'right',
              width: '120px',
              cell: (row) => (
                <span
                  className={cn(
                    'font-mono text-sm font-semibold tnum',
                    row.basis_points >= NEGATIVE_MARGIN && 'text-danger',
                  )}
                >
                  {formatPercent(row.basis_points)}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              width: '130px',
              cell: (row) => <StatusBadge status={row.status} />,
            },
            {
              key: 'ends',
              header: 'Scheduled end',
              width: '190px',
              cell: (row) => (
                <span className="text-[13px] text-ink-mute">
                  {row.scheduled_end ? formatDateTime(row.scheduled_end) : '—'}
                </span>
              ),
            },
            {
              key: 'operator',
              header: 'Created by',
              cell: (row) => (
                <span className="text-[13px] text-ink-mute">
                  {row.operator} · {formatDate(row.created_at)}
                </span>
              ),
            },
            {
              key: 'action',
              header: 'Action',
              align: 'right',
              width: '130px',
              cell: (row) =>
                row.status === 'verified' ? (
                  <Button size="sm" onClick={() => setActivating(row)}>
                    Activate
                  </Button>
                ) : (
                  <span className="text-[12.5px] text-ink-mute">—</span>
                ),
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              title={row.game_name}
              meta={`${row.operator} · ${formatDate(row.created_at)}`}
              value={
                <span
                  className={cn(
                    'font-mono text-sm font-semibold tnum',
                    row.basis_points >= NEGATIVE_MARGIN && 'text-danger',
                  )}
                >
                  {formatPercent(row.basis_points)}
                </span>
              }
              aside={<StatusBadge status={row.status} />}
              actions={
                row.status === 'verified' ? (
                  <Button size="sm" className="col-span-2" onClick={() => setActivating(row)}>
                    Activate
                  </Button>
                ) : undefined
              }
            />
          )}
        />
      )}

      <ActivateDialog profile={activating} onClose={() => setActivating(null)} />
    </div>
  )
}

function ActivateDialog({ profile, onClose }: { profile: RtpProfile | null; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const [endsAt, setEndsAt] = useState('')

  if (!profile) {
    return null
  }

  const negativeMargin = profile.basis_points >= NEGATIVE_MARGIN
  const phrase = formatPercent(profile.basis_points)
  const ready = negativeMargin ? typed.trim() === phrase && endsAt !== '' : true

  return (
    <Modal
      open
      onClose={onClose}
      title={`Activate ${phrase} on ${profile.game_name}`}
      description={
        negativeMargin
          ? 'This profile pays out more than it takes in. It cannot run open-ended.'
          : 'The engine has verified this profile. Activating retires the profile currently in force.'
      }
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={negativeMargin ? 'destructive' : 'primary'}
            disabled={!ready}
            onClick={onClose}
          >
            Activate {phrase}
          </Button>
        </div>
      }
    >
      {negativeMargin ? (
        <div className="flex flex-col gap-4">
          <Field label="Scheduled end — required" htmlFor="rtp-end">
            <Input
              id="rtp-end"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>

          <Field
            label={`Type ${phrase} to confirm`}
            htmlFor="rtp-confirm"
            hint="A typed confirmation is what separates a deliberate promotion from a typo."
          >
            <Input
              id="rtp-confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="font-mono"
            />
          </Field>
        </div>
      ) : (
        <p className="text-[13.5px] leading-relaxed text-ink-soft">
          The change takes effect on the next round. Rounds already in flight settle against the
          profile they started under.
        </p>
      )}
    </Modal>
  )
}
