import { Check } from 'lucide-react'

import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { formatMoney, money } from '@/lib/money'

import { setActiveCurrency, useActiveCurrency } from './activeCurrency'
import { useWallets } from './hooks'

type SwitchCurrencyDialogProps = {
  open: boolean
  onClose: () => void
}

export function SwitchCurrencyDialog({ open, onClose }: SwitchCurrencyDialogProps) {
  const active = useActiveCurrency()
  const walletsQuery = useWallets()
  const wallets = walletsQuery.data ?? []

  return (
    <Modal open={open} onClose={onClose} title="Switch currency" size="sm">
      <div className="flex flex-col gap-1">
        {wallets.map((wallet) => {
          const current = wallet.currency === active
          return (
            <button
              key={wallet.currency}
              type="button"
              aria-current={current ? 'true' : undefined}
              onClick={() => {
                setActiveCurrency(wallet.currency)
                onClose()
              }}
              className={cn(
                'flex min-h-12 w-full items-center justify-between gap-3 rounded-input px-3 text-left',
                'transition-colors duration-[120ms] hover:bg-wash',
                current ? 'bg-wash text-ink' : 'text-ink-soft',
              )}
            >
              <span className="flex items-center gap-2 text-[13.5px] font-medium">
                {wallet.currency}
                {current ? <Check aria-hidden size={14} strokeWidth={2} className="text-accent-ink" /> : null}
              </span>
              <span className="font-mono text-[13.5px] font-medium tnum">
                {formatMoney(money(wallet.balance_minor, wallet.currency))}
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
