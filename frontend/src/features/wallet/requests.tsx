import { Link } from 'react-router'

import type { DepositRequest, WithdrawalRequest } from '@/api/types'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import type { Column } from '@/components/ui/RecordTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDateTime } from '@/lib/format'
import { money } from '@/lib/money'
import { paths } from '@/routes/paths'

const methodLink = 'text-ink-soft hover:text-ink focus-visible:text-ink'

export const depositColumns: Column<DepositRequest>[] = [
  {
    key: 'date',
    header: 'Date',
    width: '190px',
    cell: (row) => <span className="font-mono text-[13px] text-ink-mute">{formatDateTime(row.created_at)}</span>,
  },
  {
    key: 'method',
    header: 'Method',
    cell: (row) => (
      <Link to={paths.depositStatus(row.id)} className={methodLink}>
        {row.method_name}
      </Link>
    ),
  },
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
    cell: (row) => <MoneyDisplay value={money(row.amount_minor, row.currency)} />,
  },
]

export const withdrawalColumns: Column<WithdrawalRequest>[] = [
  {
    key: 'date',
    header: 'Date',
    width: '190px',
    cell: (row) => <span className="font-mono text-[13px] text-ink-mute">{formatDateTime(row.created_at)}</span>,
  },
  {
    key: 'method',
    header: 'Method',
    cell: (row) => (
      <Link to={paths.withdrawalStatus(row.id)} className={methodLink}>
        {row.method_name}
      </Link>
    ),
  },
  { key: 'status', header: 'Status', width: '130px', cell: (row) => <StatusBadge status={row.status} /> },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    width: '160px',
    cell: (row) => <MoneyDisplay value={money(row.amount_minor, row.currency)} />,
  },
]
