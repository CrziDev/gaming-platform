import type { TransactionStatus } from '@/api/types'
import { StatusBadge } from '@/components/ui/StatusBadge'

export function LedgerStatus({ status }: { status: TransactionStatus }) {
  return status === 'applied' ? null : <StatusBadge status={status} />
}
