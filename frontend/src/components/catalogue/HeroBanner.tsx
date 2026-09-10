import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import type { Game } from '@/api/types'
import { GameArt } from '@/components/catalogue/GameArt'
import { buttonStyles } from '@/components/ui/Button'
import { useAuthIntent, useSession } from '@/features/auth'
import { paths } from '@/routes/paths'

export function HeroBanner({ featured }: { featured: Game | undefined }) {
  const { data: user } = useSession()
  const { open } = useAuthIntent()

  if (!featured) {
    return null
  }

  const destination = paths.game(featured.slug)

  return (
    <section className="relative isolate overflow-hidden rounded-sheet border border-line bg-panel">
      <GameArt seed={featured.art_seed} className="absolute inset-0 -z-10 size-full" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-base via-base/88 to-base/20" />

      <div className="flex min-h-52 flex-col justify-center gap-3 p-5 sm:min-h-60 sm:p-7">
        <div className="flex items-center gap-2.5">
          <span className="label-mono text-accent">Featured</span>
          <span aria-hidden className="h-px w-6 bg-line-strong" />
          <span className="font-mono text-[10px] tracking-[0.14em] text-ink-mute uppercase">
            {featured.category_name}
          </span>
        </div>

        <h1 className="max-w-[14ch] font-display text-[26px] leading-[1.05] font-semibold tracking-tight text-balance sm:text-[32px]">
          {featured.name}
        </h1>

        <p className="max-w-[44ch] text-[13.5px] leading-relaxed text-ink-mute text-pretty">
          One wallet, one currency, and a ledger that reconciles — every stake and every win lands in
          your history the moment it settles.
        </p>

        <div className="flex flex-wrap gap-2.5 pt-1">
          {user ? (
            <Link to={destination} className={buttonStyles('primary', 'sm')}>
              Play {featured.name}
              <ChevronRight aria-hidden size={15} strokeWidth={1.5} />
            </Link>
          ) : (
            <button
              type="button"
              className={buttonStyles('primary', 'sm')}
              onClick={() => open({ tab: 'join', redirectTo: destination, context: featured.name })}
            >
              Join now
              <ChevronRight aria-hidden size={15} strokeWidth={1.5} />
            </button>
          )}
          <Link to={paths.games} className={buttonStyles('secondary', 'sm')}>
            Browse all games
          </Link>
        </div>
      </div>
    </section>
  )
}
