import { Link } from 'react-router'

import type { Game } from '@/api/types'
import { buttonStyles } from '@/components/ui/Button'
import { useAuthIntent, useSession } from '@/features/auth'
import { useActiveCurrency } from '@/features/wallet'
import { bannerArtUrl } from '@/lib/gameArt'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function HeroBanner({ featured }: { featured: Game | undefined }) {
  const { data: user } = useSession()
  const { open } = useAuthIntent()
  const currency = useActiveCurrency()

  if (!featured) {
    return null
  }

  const destination = paths.game(featured.slug)
  const minBet = formatMoney(money(featured.wager_limits[currency].min_wager_minor, currency))

  const art = bannerArtUrl(featured)

  return (
    <section className="relative overflow-hidden rounded-card bg-banner">
      {art ? (
        <>
          <img
            src={art}
            alt=""
            decoding="async"
            className="absolute inset-0 size-full object-cover object-right-bottom"
          />
          <div aria-hidden className="banner-scrim absolute inset-0 @min-[640px]:right-auto @min-[640px]:w-1/2 @min-[640px]:[--banner-scrim-angle:90deg]" />
        </>
      ) : null}

      <div className="relative flex min-h-[300px] flex-col items-start gap-2.5 p-[18px] @min-[640px]:min-h-[236px] @min-[640px]:max-w-[52%] @min-[640px]:justify-center @min-[640px]:px-6 @min-[640px]:py-[22px]">
        <span className="label-mono inline-flex items-center gap-1.5 text-accent-ink">
          <span aria-hidden className="size-[5px] rounded-full bg-accent-ink" />
          Featured
        </span>

        <h1 className="text-[22px] leading-[1.1] font-bold tracking-[-0.02em] text-ink text-balance @min-[640px]:text-[28px]">
          {featured.name}
        </h1>

        {featured.description ? (
          <p className="max-w-[44ch] text-[13.5px] leading-normal text-ink-mute text-pretty">
            {featured.description}
          </p>
        ) : null}

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
    </section>
  )
}
