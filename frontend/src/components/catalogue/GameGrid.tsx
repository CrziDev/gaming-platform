import type { Game } from '@/api/types'
import { GameCard } from '@/components/catalogue/GameCard'
import { cn } from '@/lib/cn'

export const gridDensity = {
  lobby: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]',
  catalogue: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(132px,1fr))]',
}

type GameGridProps = {
  games: Game[]
  density?: keyof typeof gridDensity
  label: string
}

export function GameGrid({ games, density = 'lobby', label }: GameGridProps) {
  return (
    <ul aria-label={label} className={cn('grid gap-4', gridDensity[density])}>
      {games.map((game) => (
        <li key={game.id}>
          <GameCard game={game} />
        </li>
      ))}
    </ul>
  )
}

export function GameCarousel({ games, label }: { games: Game[]; label: string }) {
  return (
    <ul
      aria-label={label}
      className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1"
    >
      {games.map((game) => (
        <li key={game.id} className="w-[calc(50%-2rem)] shrink-0 snap-start sm:w-44 lg:w-40">
          <GameCard game={game} />
        </li>
      ))}
    </ul>
  )
}
