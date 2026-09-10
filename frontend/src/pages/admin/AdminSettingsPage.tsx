import { Plus } from 'lucide-react'
import { useState } from 'react'

import { PageHeading } from '@/components/admin/PageHeading'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { UnderlineTabs } from '@/components/ui/Tabs'
import { useAdminPaymentMethods, useStaff } from '@/features/admin'
import { formatMoney, money } from '@/lib/money'

type SettingsTab = 'methods' | 'staff' | 'limits' | 'platform'

export function AdminSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('methods')

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Settings" meta="Owner-only changes are marked. Everything here writes to the audit log." />

      <UnderlineTabs
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

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-mute">
          What appears in the player&rsquo;s deposit step. Each method carries a display name, the
          account details the player pays into, and whether a reference number is required. Turning
          every method off disables deposits platform-wide.
        </p>
        <Button size="sm">
          <Plus aria-hidden size={15} strokeWidth={2} />
          Add method
        </Button>
      </div>

      {methodsQuery.isPending ? (
        <SkeletonRows count={2} />
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
              align: 'right',
              width: '110px',
              cell: (row) => <StatusBadge status={row.enabled ? 'Live' : 'Off'} />,
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              title={row.name}
              meta={row.pay_to}
              aside={<StatusBadge status={row.enabled ? 'Live' : 'Off'} />}
            />
          )}
        />
      )}
    </section>
  )
}

function StaffTab() {
  const staffQuery = useStaff()

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-mute">
          Owner grants all access including RTP and staff. Operator covers deposits, users and games.
          Owner-only section.
        </p>
        <Button size="sm">
          <Plus aria-hidden size={15} strokeWidth={2} />
          Invite staff
        </Button>
      </div>

      {staffQuery.isPending ? (
        <SkeletonRows count={3} />
      ) : (
        <RecordTable
          label="Staff accounts"
          rows={staffQuery.data ?? []}
          rowKey={(row) => row.id}
          columns={[
            { key: 'name', header: 'Name', cell: (row) => row.name },
            {
              key: 'email',
              header: 'Work email',
              cell: (row) => <span className="text-[13px] text-ink-mute">{row.email}</span>,
            },
            { key: 'role', header: 'Role', width: '130px', cell: (row) => row.role },
            {
              key: 'status',
              header: 'Status',
              align: 'right',
              width: '120px',
              cell: (row) => <StatusBadge status={row.enabled ? 'Active' : 'Disabled'} />,
            },
          ]}
          renderCard={(row) => (
            <RecordCard
              title={row.name}
              meta={`${row.email} · ${row.role}`}
              aside={<StatusBadge status={row.enabled ? 'Active' : 'Disabled'} />}
            />
          )}
        />
      )}
    </section>
  )
}

function LimitsTab() {
  return (
    <section className="grid max-w-2xl gap-4">
      <Field label="Minimum per deposit request" htmlFor="limit-min">
        <Input id="limit-min" defaultValue={formatMoney(money(10_000), { symbol: false })} className="font-mono" />
      </Field>
      <Field label="Maximum per deposit request" htmlFor="limit-max">
        <Input
          id="limit-max"
          defaultValue={formatMoney(money(5_000_000), { symbol: false })}
          className="font-mono"
        />
      </Field>
      <Field label="Maximum per player per day" htmlFor="limit-day">
        <Input
          id="limit-day"
          defaultValue={formatMoney(money(10_000_000), { symbol: false })}
          className="font-mono"
        />
      </Field>
      <Field
        label="Concurrent pending requests"
        htmlFor="limit-pending"
        hint="One open request per player keeps the queue reconcilable."
      >
        <Select id="limit-pending" defaultValue="1">
          <option value="1">One at a time</option>
          <option value="many">Unlimited</option>
        </Select>
      </Field>
      <div>
        <Button>Save limits</Button>
      </div>
    </section>
  )
}

function PlatformTab() {
  return (
    <section className="grid max-w-2xl gap-4">
      <Field label="Platform name" htmlFor="platform-name">
        <Input id="platform-name" defaultValue="Gaming Platform" />
      </Field>
      <Field label="Support link" htmlFor="platform-support">
        <Input id="platform-support" defaultValue="https://support.example.com" />
      </Field>
      <Field label="Default language" htmlFor="platform-language">
        <Select id="platform-language" defaultValue="en">
          <option value="en">English</option>
        </Select>
      </Field>
      <Field
        label="Registration currencies"
        htmlFor="platform-currency"
        hint="A player's currency is fixed at registration and never converted."
      >
        <Select id="platform-currency" defaultValue="PHP">
          <option value="PHP">PHP · ₱</option>
        </Select>
      </Field>
      <div>
        <Button>Save platform settings</Button>
      </div>
    </section>
  )
}
