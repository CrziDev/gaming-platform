import { Trophy } from 'lucide-react'
import { Link } from 'react-router'

import type { BigWin } from '@/api/types'
import { currencySymbol, formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function BigWins({ wins }: { wins: BigWin[] }) {
  if (wins.length === 0) {
    return null
  }

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">
        <Trophy aria-hidden size={15} strokeWidth={1.6} className="text-ink-mute" />
        Big wins
      </h2>
      <ul aria-label="Big wins" tabIndex={0} className="scrollbar-hidden -mx-3.5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3.5">
        {wins.map((win) => {
          const amount = money(win.amount_minor, win.currency)
          return (
            <li key={win.id} className="w-[172px] shrink-0 snap-start">
              <Link
                to={paths.game(win.game_slug)}
                aria-label={`${win.username} won ${formatMoney(amount)}`}
                className="flex items-center gap-2 rounded-tile bg-surface-1 py-[7px] pr-2.5 pl-[7px] transition-colors duration-[120ms] hover:bg-surface-2"
              >
                <span aria-hidden className="size-[34px] shrink-0 rounded-chip bg-surface-3" />
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="truncate text-[11.5px] text-ink-mute">{win.username}</span>
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="flex size-3.5 items-center justify-center rounded-full bg-gold text-[9px] font-semibold text-on-gold"
                    >
                      {currencySymbol(win.currency)}
                    </span>
                    <span className="font-mono text-[13px] font-medium text-win tnum">
                      {formatMoney(amount, { symbol: false, decimals: 'trim' })}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
