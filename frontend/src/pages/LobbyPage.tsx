import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import { gridDensity } from '@/components/catalogue/GameGrid'
import { GameRow } from '@/components/catalogue/GameRow'
import { HeroBanner } from '@/components/catalogue/HeroBanner'
import { ErrorState } from '@/components/ui/States'
import { SkeletonGrid } from '@/components/ui/Skeleton'
import { useSession } from '@/features/auth'
import { gamesByIds, useGames, useLobbyRows } from '@/features/catalogue'
import { paths } from '@/routes/paths'

export function LobbyPage() {
  const { data: user } = useSession()
  const rowsQuery = useLobbyRows(Boolean(user))
  const gamesQuery = useGames({ category: 'all', search: '', sort: 'name' })

  if (rowsQuery.isError) {
    return <ErrorState message={rowsQuery.error.message} onRetry={() => void rowsQuery.refetch()} />
  }

  return (
    <div className="flex flex-col gap-7 lg:gap-8">
      <HeroBanner featured={gamesQuery.data?.[0]} />

      {rowsQuery.isPending ? (
        <SkeletonGrid count={4} className={gridDensity.lobby} />
      ) : (
        rowsQuery.data?.map((row) => (
          <GameRow
            key={row.id}
            title={row.title}
            categorySlug={row.category_slug}
            games={gamesByIds(row.game_ids)}
          />
        ))
      )}

      <Link
        to={paths.games}
        className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface-1 px-5 py-3.5 transition-colors duration-[120ms] hover:border-line-hover lg:py-3"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-display text-[15px] font-semibold text-ink">Browse all games</span>
          <span className="text-[12.5px] text-ink-mute">
            Search, categories and sort — {gamesQuery.data?.length ?? 0} games
          </span>
        </span>
        <ChevronRight aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-ink-mute" />
      </Link>
    </div>
  )
}
