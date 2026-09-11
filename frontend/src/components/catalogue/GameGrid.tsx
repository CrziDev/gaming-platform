import type { Game } from '@/api/types'
import { GameCard } from '@/components/catalogue/GameCard'
import { cn } from '@/lib/cn'

export const gameGrid =
  'grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(116px,1fr))] @min-[560px]:grid-cols-[repeat(auto-fill,minmax(126px,1fr))]'

type GameGridProps = {
  games: Game[]
  label: string
  className?: string
}

export function GameGrid({ games, label, className }: GameGridProps) {
  return (
    <ul aria-label={label} className={cn(gameGrid, className)}>
      {games.map((game) => (
        <li key={game.id}>
          <GameCard game={game} />
        </li>
      ))}
    </ul>
  )
}
