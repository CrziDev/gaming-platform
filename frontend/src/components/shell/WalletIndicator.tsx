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
        className="flex min-h-11 items-center gap-2 rounded-input bg-inset py-1 pr-2.5 pl-2 text-ink-soft transition-[color,background-color,transform] duration-fast ease-standard hover:bg-wash active:translate-y-px motion-reduce:transform-none lg:min-h-[34px]"
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
          className="value-update font-mono text-[13.5px] font-medium tnum"
        >
          <span className="hidden sm:inline">{formatMoney(balance, { symbol: false })}</span>
          <span className="sm:hidden">{formatMoney(balance, { symbol: false, decimals: 'trim' })}</span>
        </span>
        <ChevronDown aria-hidden size={12} strokeWidth={2.2} className="text-ink-mute" />
      </Link>
      <span className="sr-only" aria-live="polite">
        Wallet balance {full}
      </span>
    </>
  )
}
