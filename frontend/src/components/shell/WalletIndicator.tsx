import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { formatMoney, type Money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function WalletIndicator({ balance }: { balance: Money }) {
  const full = formatMoney(balance)

  return (
    <>
      <div className="glass-pill flex h-10 shrink-0 items-center gap-1.5 rounded-pill pr-1 pl-2.5 sm:gap-2 sm:pr-[5px] sm:pl-3">
        <Link
          to={paths.wallet}
          aria-label={`Wallet balance ${full}`}
          className="tap-target flex h-full items-center gap-2 text-ink transition-opacity duration-fast ease-standard hover:opacity-85"
        >
          <WalletGlyph />
          <span
            key={`${balance.currency}-${balance.amount_minor}`}
            aria-hidden
            className="value-update text-[13.5px] font-medium tnum sm:text-[14px]"
          >
            <span className="hidden sm:inline">{full}</span>
            <span className="sm:hidden">{formatMoney(balance, { decimals: 'trim' })}</span>
          </span>
        </Link>
        <Link
          to={paths.deposit}
          aria-label="Deposit"
          title="Deposit"
          className="cta-gradient cta-glow flex size-8.5 shrink-0 items-center justify-center rounded-full transition-[filter] duration-fast ease-standard hover:brightness-110 sm:size-8"
        >
          <Plus aria-hidden size={16} strokeWidth={3} />
        </Link>
      </div>
      <span className="sr-only" aria-live="polite">
        Wallet balance {full}
      </span>
    </>
  )
}

function WalletGlyph() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" className="shrink-0 text-brand max-[379px]:hidden">
      <path
        fill="currentColor"
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18v3H6.5a.5.5 0 0 0 0 1H20a1 1 0 0 1 1 1v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A2.5 2.5 0 0 1 4 17.5z"
      />
      <circle cx="16.5" cy="13.5" r="1.4" fill="#0a0f16" />
    </svg>
  )
}
