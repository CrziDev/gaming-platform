import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import { ApiError } from '@/api/client'
import type { AdminPaymentMethod } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, Input, inputClass } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import {
  paymentMethodSchema,
  useCreatePaymentMethod,
  useUpdatePaymentMethod,
  type PaymentMethodFormInput,
} from '@/features/admin'
import { cn } from '@/lib/cn'

type PaymentMethodDialogProps = {
  open: boolean
  method?: AdminPaymentMethod
  onClose: () => void
}

const serverFields: Record<string, keyof PaymentMethodFormInput> = {
  name: 'name',
  description: 'description',
  pay_to: 'pay_to',
  reference_required: 'reference_required',
  enabled: 'enabled',
}

export function PaymentMethodDialog({ open, method, onClose }: PaymentMethodDialogProps) {
  const create = useCreatePaymentMethod()
  const update = useUpdatePaymentMethod()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PaymentMethodFormInput>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: method
      ? {
          name: method.name,
          description: method.description,
          pay_to: method.pay_to,
          reference_required: method.reference_required,
          enabled: method.enabled,
        }
      : { name: '', description: '', pay_to: '', reference_required: true, enabled: false },
  })

  if (!open) return null

  const mutation = method ? update : create
  const pending = isSubmitting || mutation.isPending
  const onSubmit = handleSubmit(async (values) => {
    mutation.reset()
    try {
      if (method) await update.mutateAsync({ id: method.id, patch: values })
      else await create.mutateAsync(values)
      onClose()
    } catch (error) {
      if (!(error instanceof ApiError)) return
      for (const [serverField, formField] of Object.entries(serverFields)) {
        const message = error.fields[serverField]
        if (message) setError(formField, { type: 'server', message })
      }
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={method ? `Edit ${method.name}` : 'Add payment method'}
      description="Enabled methods appear immediately in the player deposit form. Existing deposit history is preserved when a method is disabled."
      footer={
        <div className="flex flex-col gap-3">
          {mutation.isError && !(mutation.error instanceof ApiError && Object.keys(mutation.error.fields).length > 0) ? (
            <p role="alert" className="text-[13px] text-danger">
              {mutation.error instanceof Error ? mutation.error.message : 'The payment method could not be saved.'}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" form="payment-method-form" disabled={pending}>
              {method ? 'Save changes' : 'Add method'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="payment-method-form" onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
        <Field label="Name" htmlFor="payment-name" error={errors.name?.message}>
          <Input id="payment-name" autoComplete="off" {...register('name')} />
        </Field>
        <Field label="Description" htmlFor="payment-description" error={errors.description?.message}>
          <textarea
            id="payment-description"
            rows={3}
            className={cn(inputClass, 'min-h-[78px] resize-y py-2 leading-relaxed')}
            {...register('description')}
          />
        </Field>
        <Field
          label="Pay-to details"
          htmlFor="payment-pay-to"
          error={errors.pay_to?.message}
          hint="The account, phone number, or instructions players must use before uploading proof."
        >
          <textarea
            id="payment-pay-to"
            rows={3}
            className={cn(inputClass, 'min-h-[78px] resize-y py-2 font-mono leading-relaxed')}
            {...register('pay_to')}
          />
        </Field>
        <label className="flex items-start gap-3 rounded-input bg-inset p-3 text-[13px] text-ink-soft">
          <input type="checkbox" className="mt-0.5 size-4 accent-accent" {...register('reference_required')} />
          <span>
            <span className="block font-medium">Require a payment reference</span>
            <span className="block text-[12px] text-ink-mute">Players must enter the reference from their payment app.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-input bg-inset p-3 text-[13px] text-ink-soft">
          <input type="checkbox" className="mt-0.5 size-4 accent-accent" {...register('enabled')} />
          <span>
            <span className="block font-medium">Enabled for deposits</span>
            <span className="block text-[12px] text-ink-mute">Players can select this method immediately after saving.</span>
          </span>
        </label>
      </form>
    </Modal>
  )
}
