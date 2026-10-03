import { Plus } from 'lucide-react'
import { useState } from 'react'

import type { AdminPaymentMethod, StaffMember } from '@/api/types'
import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { FutureDevelopment } from '@/components/ui/FutureDevelopment'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ChipTabs } from '@/components/ui/Tabs'
import { useAdminPaymentMethods, useSetStaffAlerts, useStaff, useUpdatePaymentMethod } from '@/features/admin'

import { PaymentMethodDialog } from './PaymentMethodDialog'

type SettingsTab = 'methods' | 'staff' | 'limits' | 'platform'

export function AdminSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('methods')

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Settings" />

      <ChipTabs
        items={[
          { id: 'methods' as const, label: 'Payment methods' },
          { id: 'staff' as const, label: 'Staff' },
          { id: 'limits' as const, label: 'Limits' },
          { id: 'platform' as const, label: 'Platform' },
        ]}
        value={tab}
        onChange={setTab}
        label="Settings sections"
      />

      {tab === 'methods' ? <MethodsTab /> : null}
      {tab === 'staff' ? <StaffTab /> : null}
      {tab === 'limits' ? <LimitsTab /> : null}
      {tab === 'platform' ? <PlatformTab /> : null}
    </div>
  )
}

function MethodsTab() {
  const methodsQuery = useAdminPaymentMethods()
  const update = useUpdatePaymentMethod()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminPaymentMethod | undefined>(undefined)

  const toggle = (method: AdminPaymentMethod) => {
    update.mutate({ id: method.id, patch: { enabled: !method.enabled } })
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-mute">
          Disabling every method turns deposits off for all players.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus aria-hidden size={15} strokeWidth={2} />
          Add method
        </Button>
      </div>

      {methodsQuery.isPending ? (
        <SkeletonRows count={2} />
      ) : methodsQuery.isError ? (
        <ErrorState
          title="Payment methods unavailable"
          message="Payment methods could not be loaded."
          onRetry={() => void methodsQuery.refetch()}
        />
      ) : (methodsQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="No payment methods"
          description="Add a payment method before accepting player deposits."
        />
      ) : (
        <RecordTable
          label="Payment methods"
          rows={methodsQuery.data ?? []}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'name',
              header: 'Name',
              cell: (row) => <span className="text-[13.5px]">{row.name}</span>,
            },
            {
              key: 'payto',
              header: 'Pay-to details',
              cell: (row) => <span className="font-mono text-[12.5px] text-ink-mute">{row.pay_to}</span>,
            },
            {
              key: 'reference',
              header: 'Reference',
              width: '120px',
              cell: (row) => (
                <span className="text-[12.5px] text-ink-mute">
                  {row.reference_required ? 'Required' : 'Optional'}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              width: '110px',
              cell: (row) => <StatusBadge status={row.enabled ? 'Live' : 'Off'} />,
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              width: '190px',
              cell: (row) => (
                <span className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => toggle(row)} disabled={update.isPending}>
                    {row.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(row)}>
                    Edit
                  </Button>
                </span>
              ),
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              title={row.name}
              meta={row.pay_to}
              aside={<StatusBadge status={row.enabled ? 'Live' : 'Off'} />}
              actions={
                <>
                  <Button variant="secondary" size="sm" onClick={() => toggle(row)} disabled={update.isPending}>
                    {row.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(row)}>
                    Edit
                  </Button>
                </>
              }
            />
          )}
        />
      )}

      {update.isError ? (
        <p role="alert" className="text-[13px] text-danger">The payment-method status could not be changed.</p>
      ) : null}

      <PaymentMethodDialog
        key={creating ? 'create-open' : 'create-closed'}
        open={creating}
        onClose={() => setCreating(false)}
      />
      <PaymentMethodDialog
        key={editing?.id ?? 'none'}
        open={editing !== undefined}
        {...(editing ? { method: editing } : {})}
        onClose={() => setEditing(undefined)}
      />
    </section>
  )
}

function StaffTab() {
  const staffQuery = useStaff()
  const setAlerts = useSetStaffAlerts()

  const toggle = (member: StaffMember) => {
    setAlerts.mutate({ id: member.id, enabled: !member.alert_emails })
  }
  const toggleButton = (member: StaffMember) => (
    <Button variant="secondary" size="sm" onClick={() => toggle(member)} disabled={setAlerts.isPending}>
      {member.alert_emails ? 'Turn off' : 'Turn on'}
    </Button>
  )

  return (
    <section className="flex flex-col gap-4">
      <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-mute">
        Administrators with email alerts on are emailed about new deposit and withdrawal requests.
      </p>

      {staffQuery.isPending ? (
        <SkeletonRows count={2} />
      ) : staffQuery.isError ? (
        <ErrorState
          title="Staff unavailable"
          message="Administrators could not be loaded."
          onRetry={() => void staffQuery.refetch()}
        />
      ) : (
        <RecordTable
          label="Administrators"
          rows={staffQuery.data ?? []}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'name',
              header: 'Name',
              cell: (row) => <span className="text-[13.5px]">{row.display_name}</span>,
            },
            {
              key: 'email',
              header: 'Email',
              cell: (row) => <span className="text-[12.5px] text-ink-mute">{row.email}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              width: '110px',
              cell: (row) => <StatusBadge status={row.status} />,
            },
            {
              key: 'alerts',
              header: 'Email alerts',
              width: '120px',
              cell: (row) => <StatusBadge status={row.alert_emails ? 'On' : 'Off'} tone={row.alert_emails ? 'success' : 'neutral'} />,
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              width: '130px',
              cell: (row) => <span className="flex justify-end">{toggleButton(row)}</span>,
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              title={row.display_name}
              meta={row.email}
              aside={<StatusBadge status={row.alert_emails ? 'Alerts on' : 'Alerts off'} tone={row.alert_emails ? 'success' : 'neutral'} />}
              actions={toggleButton(row)}
            />
          )}
        />
      )}

      {setAlerts.isError ? (
        <p role="alert" className="text-[13px] text-danger">Email alerts could not be changed.</p>
      ) : null}
    </section>
  )
}

function LimitsTab() {
  return <FutureDevelopment />
}

function PlatformTab() {
  return <FutureDevelopment />
}
