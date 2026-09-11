import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import type { Game } from '@/api/types'
import { GameGrid } from '@/components/catalogue/GameGrid'
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
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">{title}</h2>
        {showLink ? <SeeAll to={`${paths.games}?category=${categorySlug}`} /> : null}
      </header>

      <GameGrid games={games} label={title} />
    </section>
  )
}

export function SeeAll({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[12.5px] font-medium text-ink-mute transition-colors duration-[120ms] hover:text-ink-soft lg:min-h-8"
    >
      See all
      <ChevronRight aria-hidden size={13} strokeWidth={2} />
    </Link>
  )
}
