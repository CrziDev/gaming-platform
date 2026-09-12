import type { Transaction } from '@/api/types'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import type { Column } from '@/components/ui/RecordTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDateTime } from '@/lib/format'
import { money } from '@/lib/money'

export const ledgerColumns: Column<Transaction>[] = [
  {
    key: 'date',
    header: 'Date',
    width: '190px',
    cell: (row) => <span className="font-mono text-[13px] text-ink-mute">{formatDateTime(row.created_at)}</span>,
  },
  { key: 'type', header: 'Type', cell: (row) => row.label },
  {
    key: 'reference',
    header: 'Reference',
    width: '140px',
    cell: (row) => <span className="font-mono text-[13px] text-ink-mute">{row.reference}</span>,
  },
  { key: 'status', header: 'Status', width: '130px', cell: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    width: '160px',
    cell: (row) => (
      <MoneyDisplay value={money(row.amount_minor, row.currency)} tone="auto" sign="always" />
    ),
  },
]
