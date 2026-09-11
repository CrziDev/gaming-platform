import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import type { Game } from '@/api/types'
import { GameArt } from '@/components/catalogue/GameArt'
import { buttonStyles } from '@/components/ui/Button'
import { useAuthIntent, useSession } from '@/features/auth'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function HeroBanner({ featured }: { featured: Game | undefined }) {
  const { data: user } = useSession()
  const { open } = useAuthIntent()

  if (!featured) {
    return null
  }

  const destination = paths.game(featured.slug)
  const minBet = formatMoney(money(featured.min_wager_minor, featured.currency))

  return (
    <section className="relative isolate overflow-hidden rounded-card bg-panel">
      <GameArt seed={featured.art_seed} className="absolute inset-0 -z-10 size-full lg:hidden" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-base via-base/80 to-base/10 lg:hidden" />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,36%)]">
        <div className="flex min-h-52 flex-col justify-center gap-3 p-5 sm:p-6 lg:min-h-[228px] lg:p-7">
          <div className="flex items-center gap-2.5">
            <span className="label-mono text-accent">Featured</span>
            <span aria-hidden className="h-px w-6 bg-surface-3-strong" />
            <span className="font-mono text-[10px] tracking-[0.14em] text-ink-mute uppercase">
              {featured.category_name}
            </span>
          </div>

          <h1 className="max-w-[14ch] text-[26px] leading-[1.05] font-semibold tracking-tight text-balance sm:text-[32px] lg:text-[36px]">
            {featured.name}
          </h1>

          <p className="max-w-[48ch] text-[13.5px] leading-relaxed text-ink-mute text-pretty lg:max-w-[60ch] lg:text-sm">
            One wallet, one currency, and a ledger that reconciles — every stake and every win
            lands in your history the moment it settles.
          </p>

          <p className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] tracking-[0.06em] text-ink-mute">
            <span>{featured.provider}</span>
            <span aria-hidden>·</span>
            <span>
              Min bet <span className="tnum text-ink-soft">{minBet}</span>
            </span>
            <span aria-hidden>·</span>
            <span>{featured.currency}</span>
          </p>

          <div className="flex flex-wrap gap-2.5 pt-1">
            {user ? (
              <Link to={destination} className={buttonStyles('primary', 'md')}>
                Play {featured.name}
                <ChevronRight aria-hidden size={15} strokeWidth={1.5} />
              </Link>
            ) : (
              <button
                type="button"
                className={buttonStyles('primary', 'md')}
                onClick={() => open({ tab: 'join', redirectTo: destination, context: featured.name })}
              >
                Join now
                <ChevronRight aria-hidden size={15} strokeWidth={1.5} />
              </button>
            )}
            <Link to={paths.games} className={buttonStyles('secondary', 'md')}>
              Browse all games
            </Link>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <GameArt seed={featured.art_seed} name={featured.name} className="absolute inset-0 size-full" />
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-panel to-transparent" />
        </div>
      </div>
    </section>
  )
}
