import { PageHeading } from '@/components/admin/PageHeading'
import { RecordCard, RecordTable } from '@/components/ui/RecordTable'
import { StatusBadge } from '@/components/ui/StatusBadge'

const futureWork = [
  {
    id: 'promotion-management',
    feature: 'Promotion campaigns',
    description: 'Campaign creation, scheduling, eligibility, and reporting',
  },
]

export function AdminPromotionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Promotions"
        meta="Promotion service and administration are reserved for a future release."
      />

      <RecordTable
        label="Promotion administration roadmap"
        rows={futureWork}
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'feature',
            header: 'Feature',
            cell: (row) => (
              <span className="flex flex-col">
                <span className="text-[13.5px] font-medium text-ink-soft">{row.feature}</span>
                <span className="text-[12px] text-ink-mute">{row.description}</span>
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            align: 'right',
            width: '190px',
            cell: () => <StatusBadge status="Future Development" />,
          },
        ]}
        renderCard={(row) => (
          <RecordCard
            title={row.feature}
            meta={row.description}
            aside={<StatusBadge status="Future Development" />}
          />
        )}
      />
    </div>
  )
}
