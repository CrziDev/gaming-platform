import type { Game } from '@/api/types'
import { GameGrid } from '@/components/catalogue/GameGrid'
import { SeeAll } from '@/components/ui/SeeAll'
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
