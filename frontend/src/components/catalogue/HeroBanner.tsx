import { Link } from 'react-router'

import type { Game } from '@/api/types'
import { buttonStyles } from '@/components/ui/Button'
import { useAuthIntent, useSession } from '@/features/auth'
import { bannerArtUrl } from '@/lib/gameArt'
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
          <div aria-hidden className="banner-scrim absolute inset-0 @rail:right-auto @rail:w-1/2 @rail:[--banner-scrim-angle:90deg]" />
        </>
      ) : null}

      <div className="relative flex min-h-[300px] flex-col items-start gap-2.5 p-[18px] @rail:min-h-[236px] @rail:max-w-[52%] @rail:justify-center @rail:px-6 @rail:py-[22px]">
        <span className="label-mono inline-flex items-center gap-1.5 text-accent-ink">
          <span aria-hidden className="size-[5px] rounded-full bg-accent-ink" />
          Featured
        </span>

        <h1 className="text-[22px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink text-balance @rail:text-[28px]">
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
