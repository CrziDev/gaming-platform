import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'

import { cn } from '@/lib/cn'
import { formatMoney, moneyDirection, type FormatMoneyOptions, type Money } from '@/lib/money'

export type MoneyTone = 'auto' | 'neutral' | 'danger' | 'plain'

type MoneyDisplayProps = FormatMoneyOptions & {
  value: Money
  tone?: MoneyTone
  icon?: boolean
  className?: string
}

export function MoneyDisplay({
  value,
  tone = 'plain',
  icon = false,
  className,
  ...format
}: MoneyDisplayProps) {
  const direction = moneyDirection(value)
  const Icon = direction === 'credit' ? ArrowUpRight : ArrowDownLeft

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono font-semibold tnum',
        toneClass(tone, direction),
        className,
      )}
    >
      {icon && direction !== 'zero' ? <Icon aria-hidden size={14} strokeWidth={1.5} /> : null}
      {formatMoney(value, format)}
    </span>
  )
}

function toneClass(tone: MoneyTone, direction: ReturnType<typeof moneyDirection>): string {
  if (tone === 'neutral') return 'text-ink'
  if (tone === 'danger') return 'text-danger'
  if (tone === 'auto') return direction === 'credit' ? 'text-success' : 'text-ink'
  return ''
}
