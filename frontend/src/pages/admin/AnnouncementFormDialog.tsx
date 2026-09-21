import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'

import { ApiError } from '@/api/client'
import type { AdminAnnouncement } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, Input, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import {
  announcementSchema,
  endOfLocalDay,
  localDateValue,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  type AnnouncementFormInput,
} from '@/features/announcement'
import { cn } from '@/lib/cn'

type Props = {
  open: boolean
  announcement?: AdminAnnouncement
  onClose: () => void
}

export function AnnouncementFormDialog({ open, announcement, onClose }: Props) {
  if (!open) return null
  return (
    <AnnouncementForm
      key={announcement?.id ?? 'new'}
      {...(announcement ? { announcement } : {})}
      onClose={onClose}
    />
  )
}

function AnnouncementForm({ announcement, onClose }: Omit<Props, 'open'>) {
  const create = useCreateAnnouncement()
  const update = useUpdateAnnouncement()
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AnnouncementFormInput>({
    resolver: zodResolver(announcementSchema),
    defaultValues: announcement
      ? {
          text: announcement.text,
          duration: announcement.ends_at === null ? 'permanent' : 'dated',
          end_date: announcement.ends_at === null ? '' : localDateValue(announcement.ends_at),
        }
      : { text: '', duration: 'permanent', end_date: '' },
  })
  const duration = useWatch({ control, name: 'duration' })
  const mutation = announcement ? update : create
  const pending = isSubmitting || mutation.isPending

  const onSubmit = handleSubmit(async (values) => {
    mutation.reset()
    const input = {
      text: values.text.trim(),
      ends_at: values.duration === 'permanent' ? null : endOfLocalDay(values.end_date).toISOString(),
    }
    try {
      if (announcement) await update.mutateAsync({ id: announcement.id, input })
      else await create.mutateAsync(input)
      onClose()
    } catch (error) {
      if (!(error instanceof ApiError)) return
      if (error.fields.text) setError('text', { type: 'server', message: error.fields.text })
      if (error.fields.ends_at) {
        setError('end_date', { type: 'server', message: error.fields.ends_at })
      }
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={announcement ? 'Edit announcement' : 'New announcement'}
      description="Published announcements appear immediately on the lobby."
      footer={
        <div className="flex flex-col gap-3">
          {mutation.isError &&
          !(mutation.error instanceof ApiError && Object.keys(mutation.error.fields).length > 0) ? (
            <p role="alert" className="text-[13px] text-danger">
              {mutation.error instanceof Error
                ? mutation.error.message
                : 'The announcement could not be saved.'}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="announcement-form" disabled={pending}>
              {announcement ? 'Save changes' : 'Publish'}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="announcement-form"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="flex flex-col gap-4"
      >
        <Field label="Announcement text" htmlFor="announcement-text" error={errors.text?.message}>
          <textarea
            id="announcement-text"
            rows={3}
            className={cn(inputClass, 'min-h-[82px] resize-y py-2 leading-relaxed')}
            {...register('text')}
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[12.5px] font-medium text-ink-mute">Duration</legend>
          <label className="flex min-h-11 items-center gap-3 rounded-input bg-inset px-3 text-[13px] text-ink-soft">
            <input type="radio" value="permanent" className="size-4 accent-accent" {...register('duration')} />
            Permanent
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-input bg-inset px-3 text-[13px] text-ink-soft">
            <input type="radio" value="dated" className="size-4 accent-accent" {...register('duration')} />
            End date
          </label>
        </fieldset>

        {duration === 'dated' ? (
          <Field
            label="End date"
            htmlFor="announcement-end-date"
            error={errors.end_date?.message}
            hint="The announcement remains visible through the end of this day in your local time."
          >
            <Input
              id="announcement-end-date"
              type="date"
              min={localDateValue(new Date().toISOString())}
              className="font-mono"
              {...register('end_date')}
            />
          </Field>
        ) : null}
      </form>
    </Modal>
  )
}
