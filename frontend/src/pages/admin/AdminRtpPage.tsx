import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { ApiError } from '@/api/client'
import type { RtpProfile } from '@/api/types'
import { ActiveRtp } from '@/components/admin/ActiveRtp'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useActivateRtpProfile, useRtpProfiles } from '@/features/admin'
import { formatDate, formatDateTime, formatPercent } from '@/lib/format'
import { adminPaths } from '@/routes/paths'

import { RtpProfileDialog } from './RtpProfileDialog'

const NEGATIVE_MARGIN = 10_000

export function AdminRtpPage() {
  const profilesQuery = useRtpProfiles()
  const [activating, setActivating] = useState<RtpProfile | null>(null)
  const [editing, setEditing] = useState<RtpProfile | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="RTP profiles"
        meta="Draft → Verified → Active. A value is not valid until the engine has verified it; drafts are made from a game's page."
      />

      <p className="flex items-start gap-3 rounded-card bg-danger/6 px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft">
        <AlertTriangle aria-hidden size={17} strokeWidth={1.5} className="mt-0.5 shrink-0 text-danger" />
        A profile at or above 100% is a negative-margin configuration. It requires a scheduled end time
        and a typed confirmation before it can go live.
      </p>

      {profilesQuery.isPending ? (
        <SkeletonRows count={5} />
      ) : profilesQuery.isError ? (
        <ErrorState
          title="Profiles unavailable"
          message="The RTP profiles could not be loaded."
          onRetry={() => void profilesQuery.refetch()}
        />
      ) : profilesQuery.data.length === 0 ? (
        <EmptyState
          title="No RTP profiles"
          description="Draft the first profile from a game's page. It records a target; the engine decides whether it is true."
          action={
            <Link to={adminPaths.games} className="text-accent-ink hover:text-accent-hi">
              Open games
            </Link>
          }
        />
      ) : (
        <RecordTable
          label="RTP profiles"
          rows={profilesQuery.data}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'game',
              header: 'Game',
              cell: (row) => (
                <Link to={adminPaths.game(row.game_id)} className="hover:text-ink">
                  {row.game_name}
                </Link>
              ),
            },
            {
              key: 'profile',
              header: 'Profile',
              cell: (row) => (
                <span className="text-[13px] text-ink-soft">
                  {row.name} <span className="font-mono text-ink-mute">v{row.version}</span>
                </span>
              ),
            },
            {
              key: 'value',
              header: 'Target',
              align: 'right',
              width: '110px',
              cell: (row) => <ActiveRtp basisPoints={row.target_basis_points} />,
            },
            {
              key: 'status',
              header: 'Status',
              width: '120px',
              cell: (row) => (
                <span className="flex flex-col items-start gap-1">
                  <StatusBadge status={row.status} />
                  {row.is_default ? <span className="text-[11px] text-ink-mute">Default</span> : null}
                </span>
              ),
            },
            {
              key: 'ends',
              header: 'Scheduled end',
              width: '180px',
              cell: (row) => (
                <span className="text-[13px] text-ink-mute">
                  {row.effective_until ? formatDateTime(row.effective_until) : '—'}
                </span>
              ),
            },
            {
              key: 'operator',
              header: 'Created by',
              cell: (row) => (
                <span className="text-[13px] text-ink-mute">
                  {row.created_by_display_name || 'System'} · {formatDate(row.created_at)}
                </span>
              ),
            },
            {
              key: 'action',
              header: 'Action',
              align: 'right',
              width: '130px',
              cell: (row) => <RowAction profile={row} onActivate={setActivating} onEdit={setEditing} />,
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              title={`${row.game_name} · ${row.name} v${row.version}`}
              meta={`${row.created_by_display_name || 'System'} · ${formatDate(row.created_at)}`}
              value={<ActiveRtp basisPoints={row.target_basis_points} />}
              aside={
                <span className="flex flex-col items-end gap-1">
                  <StatusBadge status={row.status} />
                  {row.is_default ? <span className="text-[11px] text-ink-mute">Default</span> : null}
                </span>
              }
              actions={
                row.status === 'verified' || row.status === 'draft' ? (
                  <span className="col-span-2 flex">
                    <RowAction profile={row} onActivate={setActivating} onEdit={setEditing} full />
                  </span>
                ) : undefined
              }
            />
          )}
        />
      )}

      <ActivateDialog profile={activating} onClose={() => setActivating(null)} />
      {editing ? (
        <RtpProfileDialog
          open
          game={{ id: editing.game_id, name: editing.game_name }}
          profile={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

function RowAction({
  profile,
  onActivate,
  onEdit,
  full = false,
}: {
  profile: RtpProfile
  onActivate: (profile: RtpProfile) => void
  onEdit: (profile: RtpProfile) => void
  full?: boolean
}) {
  const className = full ? 'flex-1' : undefined
  if (profile.status === 'verified') {
    return (
      <Button size="sm" className={className} onClick={() => onActivate(profile)}>
        Activate
      </Button>
    )
  }
  if (profile.status === 'draft') {
    return (
      <Button size="sm" variant="secondary" className={className} onClick={() => onEdit(profile)}>
        Edit draft
      </Button>
    )
  }
  return <span className="text-[12.5px] text-ink-mute">—</span>
}

function ActivateDialog({ profile, onClose }: { profile: RtpProfile | null; onClose: () => void }) {
  if (!profile) {
    return null
  }
  return <ActivateForm key={profile.id} profile={profile} onClose={onClose} />
}

function ActivateForm({ profile, onClose }: { profile: RtpProfile; onClose: () => void }) {
  const activate = useActivateRtpProfile()
  const [typed, setTyped] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  const negativeMargin = profile.target_basis_points >= NEGATIVE_MARGIN
  const phrase = formatPercent(profile.target_basis_points)
  const ready = negativeMargin ? typed.trim() === phrase && endsAt !== '' : true

  const submit = async () => {
    setError(undefined)
    // datetime-local carries no zone; the browser's local reading of it is
    // what the operator meant, converted to UTC on the way out.
    const until = endsAt === '' ? undefined : new Date(endsAt).toISOString()
    try {
      await activate.mutateAsync({ id: profile.id, schedule: until ? { effective_until: until } : {} })
      onClose()
    } catch (failure) {
      if (failure instanceof ApiError) {
        setError(failure.fields.effective_until ?? failure.message)
        return
      }
      setError('The request could not be sent. Check your connection and try again.')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Activate ${phrase} on ${profile.game_name}`}
      description={
        negativeMargin
          ? 'This profile pays out more than it takes in. It cannot run open-ended and returns to the verified default automatically.'
          : 'The engine has verified this profile. Activating replaces the profile currently in force, which stays verified and can be brought back.'
      }
      footer={
        <div className="flex flex-col gap-3">
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={activate.isPending}>
              Cancel
            </Button>
            <Button
              variant={negativeMargin ? 'destructive' : 'primary'}
              disabled={!ready || activate.isPending}
              onClick={() => void submit()}
            >
              Activate {phrase}
            </Button>
          </div>
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
        <div className="flex flex-col gap-4">
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            The change takes effect on the next round. Rounds already in flight settle against the
            profile they started under.
          </p>
          <p className="text-[13px] leading-relaxed text-ink-mute">
            An open-ended activation becomes the verified default. A scheduled activation returns
            to that default automatically when it ends.
          </p>
          <Field label="Scheduled end — optional" htmlFor="rtp-end" hint="Leave empty to run until replaced.">
            <Input
              id="rtp-end"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
        </div>
      )}
    </Modal>
  )
}
