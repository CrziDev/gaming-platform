import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router'

import { currencySymbol, formatMoney, type Money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function WalletIndicator({ balance }: { balance: Money }) {
  const full = formatMoney(balance)

  return (
    <>
      <Link
        to={paths.wallet}
        aria-label={`Wallet balance ${full}`}
        className="tap-target flex min-h-9 shrink-0 items-center gap-1.5 rounded-input bg-inset py-1 pr-2 pl-1.5 text-ink-soft transition-[color,background-color,transform] duration-fast ease-standard hover:bg-wash active:translate-y-px motion-reduce:transform-none sm:gap-2 sm:pr-2.5 sm:pl-2 lg:min-h-[34px]"
      >
        <span
          aria-hidden
          className="flex size-[19px] items-center justify-center rounded-full bg-gold text-[11px] font-semibold text-on-gold"
        >
          {currencySymbol(balance.currency)}
        </span>
        <span
          key={`${balance.currency}-${balance.amount_minor}`}
          aria-hidden
          className="value-update font-mono text-[12.5px] font-medium tnum sm:text-[13.5px]"
        >
          <span className="hidden sm:inline">{formatMoney(balance, { symbol: false })}</span>
          <span className="sm:hidden">{formatMoney(balance, { symbol: false, decimals: 'trim' })}</span>
        </span>
        <ChevronDown aria-hidden size={12} strokeWidth={2.2} className="hidden text-ink-mute sm:inline" />
      </Link>
      <span className="sr-only" aria-live="polite">
        Wallet balance {full}
      </span>
    </>
  )
}
