import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'

import { buttonStyles } from '@/components/ui/Button'
import { FutureDevelopment } from '@/components/ui/FutureDevelopment'
import { useActiveWallet } from '@/features/wallet'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function CashOutPage() {
  const walletQuery = useActiveWallet()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="flex items-center gap-3">
        <Link
          to={paths.wallet}
          aria-label="Back to wallet"
          className="flex size-11 items-center justify-center rounded-input bg-inset text-ink-mute hover:bg-wash hover:text-ink-soft"
        >
          <ChevronLeft aria-hidden size={18} strokeWidth={1.5} />
        </Link>
        <h1 className="text-[20px] font-bold tracking-[-0.02em] text-ink">Cash out</h1>
        {walletQuery.data ? (
          <span className="ml-auto rounded-chip bg-inset px-2.5 py-1.5 text-[12.5px] font-medium tnum">
            {formatMoney(money(walletQuery.data.balance_minor, walletQuery.data.currency), { decimals: 'trim' })}
          </span>
        ) : null}
      </header>

      <FutureDevelopment />

      <Link to={paths.wallet} className={buttonStyles('secondary', 'md', true)}>
        Back to wallet
      </Link>
    </div>
  )
}
