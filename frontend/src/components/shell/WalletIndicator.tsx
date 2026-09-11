import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { formatMoney, type Money } from '@/lib/money'
import { paths } from '@/routes/paths'

type WalletIndicatorProps = {
  balance: Money
  compact?: boolean
}

export function WalletIndicator({ balance, compact = false }: WalletIndicatorProps) {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface-2 py-1 pr-1 pl-3.5 lg:min-h-9">
      {compact ? null : (
        <span className="font-mono text-[10px] tracking-[0.1em] text-ink-mute">{balance.currency}</span>
      )}
      <span className="font-mono text-sm font-semibold tnum">
        {formatMoney(balance, compact ? { decimals: 'trim' } : {})}
      </span>
      <Link
        to={paths.deposit}
        aria-label="Deposit"
        title="Deposit"
        className="relative flex size-8 items-center justify-center rounded-full bg-accent text-on-accent lg:size-7 transition-colors duration-[120ms] after:absolute after:-inset-1.5 after:content-[''] hover:bg-accent-hi"
      >
        <Plus aria-hidden size={16} strokeWidth={2} />
      </Link>
    </div>
  )
}
