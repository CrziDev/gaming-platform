import type { Game } from '@/api/types'
import { GameCard } from '@/components/catalogue/GameCard'
import { cn } from '@/lib/cn'

type GameGridProps = {
  games: Game[]
  density?: 'lobby' | 'catalogue'
  label: string
}

const density = {
  lobby: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 wide:grid-cols-5',
  catalogue: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 wide:grid-cols-6',
}

export function GameGrid({ games, density: variant = 'lobby', label }: GameGridProps) {
  return (
    <ul aria-label={label} className={cn('grid gap-4', density[variant])}>
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
      className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1"
    >
      {games.map((game) => (
        <li key={game.id} className="w-[calc(50%-2rem)] shrink-0 snap-start sm:w-44">
          <GameCard game={game} />
        </li>
      ))}
    </ul>
  )
}
