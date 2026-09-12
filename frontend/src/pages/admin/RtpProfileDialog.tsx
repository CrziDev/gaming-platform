import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { ApiError } from '@/api/client'
import type { RtpProfile } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import {
  rtpDraftSchema,
  rtpTargets,
  useCreateRtpProfile,
  useUpdateRtpProfile,
  type RtpDraftFormInput,
  type RtpDraftInput,
} from '@/features/admin'
import { formatPercent } from '@/lib/format'

type RtpProfileDialogProps = {
  open: boolean
  game: { id: string; name: string }
  profile?: RtpProfile
  onClose: () => void
}

// Drafts only. A verified profile is an immutable version; a change to one is
// a new draft with a new version, never an edit.
export function RtpProfileDialog({ open, game, profile, onClose }: RtpProfileDialogProps) {
  if (!open) {
    return null
  }
  return (
    <DraftForm key={profile?.id ?? 'new'} game={game} {...(profile ? { profile } : {})} onClose={onClose} />
  )
}

const serverFields: Record<string, keyof RtpDraftFormInput> = {
  name: 'name',
  version: 'version',
  target_basis_points: 'target_basis_points',
  engine_config_ref: 'engine_config_ref',
}

function DraftForm({ game, profile, onClose }: Omit<RtpProfileDialogProps, 'open'>) {
  const editing = profile !== undefined
  const create = useCreateRtpProfile()
  const update = useUpdateRtpProfile()
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RtpDraftFormInput>({
    resolver: zodResolver(rtpDraftSchema),
    defaultValues: profile
      ? {
          name: profile.name,
          version: String(profile.version),
          target_basis_points: String(profile.target_basis_points),
          engine_config_ref: profile.engine_config_ref,
        }
      : { name: 'Standard', version: '1', target_basis_points: '9600', engine_config_ref: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(undefined)
    const input: RtpDraftInput = {
      name: values.name,
      version: Number(values.version),
      target_basis_points: Number(values.target_basis_points),
      engine_config_ref: values.engine_config_ref,
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: profile.id, patch: input })
      } else {
        await create.mutateAsync({ gameId: game.id, input })
      }
      onClose()
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setSubmitError('The request could not be sent. Check your connection and try again.')
        return
      }
      let placed = false
      for (const [sent, field] of Object.entries(serverFields)) {
        const message = error.fields[sent]
        if (message) {
          setError(field, { type: 'server', message })
          placed = true
        }
      }
      if (!placed) {
        setSubmitError(error.message)
      }
    }
  })

  const pending = isSubmitting || create.isPending || update.isPending

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit draft · ${game.name}` : `New draft profile · ${game.name}`}
      description="A draft records an intent. It cannot go live until the engine implements it and a simulation verifies the result."
      footer={
        <div className="flex flex-col gap-3">
          {submitError ? (
            <p role="alert" className="text-[13px] text-danger">
              {submitError}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="rtp-draft-form" disabled={pending}>
              {editing ? 'Save draft' : 'Create draft'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="rtp-draft-form" onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Name" htmlFor="rtp-name" error={errors.name?.message}>
            <Input id="rtp-name" autoComplete="off" {...register('name')} />
          </Field>
          <Field label="Version" htmlFor="rtp-version" error={errors.version?.message}>
            <Input id="rtp-version" inputMode="numeric" className="font-mono" {...register('version')} />
          </Field>
        </div>

        <Field
          label="Target RTP"
          htmlFor="rtp-target"
          error={errors.target_basis_points?.message}
          hint="The Phase 1 set. A target at or above 100% pays out more than it takes and can only run with an end time."
        >
          <Select id="rtp-target" {...register('target_basis_points')}>
            {rtpTargets.map((target) => (
              <option key={target} value={target}>
                {formatPercent(target)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Engine configuration reference"
          htmlFor="rtp-config"
          error={errors.engine_config_ref?.message}
          hint="Optional. The immutable engine configuration this profile will bind to once it exists."
        >
          <Input id="rtp-config" autoComplete="off" className="font-mono" {...register('engine_config_ref')} />
        </Field>
      </form>
    </Modal>
  )
}
