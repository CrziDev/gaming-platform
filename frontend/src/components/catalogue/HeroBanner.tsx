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
    <section className="overflow-hidden rounded-card bg-banner">
      <div className="grid min-h-[168px] items-center gap-4 p-[18px] @rail:min-h-[190px] @rail:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.8fr)] @rail:px-6 @rail:py-[22px]">
        <div className="flex flex-col items-start gap-2.5">
          <span className="label-mono inline-flex items-center gap-1.5 text-accent-ink">
            <span aria-hidden className="size-[5px] rounded-full bg-accent-ink" />
            Featured
          </span>

          <h1 className="text-[22px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink text-balance @rail:text-[28px]">
            {featured.name}
          </h1>

          <p className="max-w-[44ch] text-[13.5px] leading-normal text-ink-mute text-pretty">
            One wallet, one currency, and a ledger that reconciles — every stake and every win lands
            in your history the moment it settles.
          </p>

          <p className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-ink-mute">
            <span>{featured.provider}</span>
            <span aria-hidden>·</span>
            <span>
              Min bet <span className="text-ink-soft tnum">{minBet}</span>
            </span>
            <span aria-hidden>·</span>
            <span>{featured.category_name}</span>
          </p>

          <div className="flex flex-wrap gap-2 pt-0.5">
            {user ? (
              <Link to={destination} className={buttonStyles('primary', 'lg')}>
                Play {featured.name}
              </Link>
            ) : (
              <button
                type="button"
                className={buttonStyles('primary', 'lg')}
                onClick={() => open({ tab: 'join', redirectTo: destination, context: featured.name })}
              >
                Join now
              </button>
            )}
            <Link to={paths.games} className={buttonStyles('secondary', 'lg')}>
              Browse all games
            </Link>
          </div>
        </div>

        <GameArt caption="banner artwork" className="hidden min-h-[158px] self-stretch rounded-input @rail:flex" />
      </div>
    </section>
  )
}
