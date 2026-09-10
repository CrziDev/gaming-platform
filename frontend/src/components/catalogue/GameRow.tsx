import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import type { Game } from '@/api/types'
import { GameCarousel, GameGrid } from '@/components/catalogue/GameGrid'
import { CategoryIcon } from '@/components/shell/CategoryIcon'
import { paths } from '@/routes/paths'

type GameRowProps = {
  title: string
  categorySlug: string | null
  games: Game[]
}

export function GameRow({ title, categorySlug, games }: GameRowProps) {
  if (games.length === 0) {
    return null
  }

  const showLink = categorySlug !== null && games.length > 1

  return (
    <section className="flex flex-col gap-2.5">
      <header className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink lg:text-[17px]">
          <CategoryIcon slug={categorySlug ?? ''} size={16} className="text-ink-mute" />
          {title}
          <span className="font-mono text-[11px] font-normal text-ink-mute">{games.length}</span>
        </h2>
        {showLink ? (
          <Link
            to={`${paths.games}?category=${categorySlug}`}
            className="inline-flex min-h-11 items-center gap-1 text-[13px] text-accent hover:underline"
          >
            See all
            <ChevronRight aria-hidden size={14} strokeWidth={1.5} />
          </Link>
        ) : null}
      </header>

      {games.length > 4 ? (
        <GameCarousel games={games} label={title} />
      ) : (
        <GameGrid games={games} label={title} />
      )}
    </section>
  )
}
