import { Link } from 'react-router'

import { GameGrid, gameGrid } from '@/components/catalogue/GameGrid'
import { buttonStyles } from '@/components/ui/Button'
import { SkeletonGrid } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useFavorites } from '@/features/catalogue'
import { paths } from '@/routes/paths'

export function FavoritesPage() {
  const favoritesQuery = useFavorites(true)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Favorites</h1>

      {favoritesQuery.isPending ? (
        <SkeletonGrid count={4} className={gameGrid} />
      ) : favoritesQuery.isError ? (
        <ErrorState
          message={favoritesQuery.error.message}
          onRetry={() => void favoritesQuery.refetch()}
        />
      ) : favoritesQuery.data.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          description="Tap the heart on a game and it will be waiting here."
          action={
            <Link to={paths.games} className={buttonStyles('secondary', 'sm')}>
              Browse games
            </Link>
          }
        />
      ) : (
        <GameGrid games={favoritesQuery.data} label="Favorites" />
      )}
    </div>
  )
}
