import { useState } from 'react'

import { BigWins } from '@/components/catalogue/BigWins'
import { GameGrid, gameGrid } from '@/components/catalogue/GameGrid'
import { GameRow } from '@/components/catalogue/GameRow'
import { HeroBanner } from '@/components/catalogue/HeroBanner'
import { FutureDevelopment } from '@/components/ui/FutureDevelopment'
import { SeeAll } from '@/components/ui/SeeAll'
import { SkeletonGrid } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { ChipTabs, type TabItem } from '@/components/ui/Tabs'
import { useSession } from '@/features/auth'
import {
  useCategories,
  useGames,
  useRecentlyPlayed,
} from '@/features/catalogue'
import { gameModuleFor } from '@/features/gameplay'
import { paths } from '@/routes/paths'

export function LobbyPage() {
  const { data: user } = useSession()
  const [category, setCategory] = useState('all')
  const recentlyPlayedQuery = useRecentlyPlayed(Boolean(user))
  const categoriesQuery = useCategories()
  const featuredQuery = useGames({ category: 'all', search: '', sort: 'name' })
  const gamesQuery = useGames({ category, search: '', sort: 'name' })
  // The banner promotes a title that actually plays here, the first with a registered
  // module, and falls back to the first title by name while none is listed.
  const featured =
    featuredQuery.data?.find((game) => gameModuleFor(game.slug) !== null) ??
    featuredQuery.data?.[0]

  const tabs: TabItem<string>[] = [
    { id: 'all', label: 'All games' },
    ...(categoriesQuery.data ?? []).map((entry) => ({ id: entry.slug, label: entry.name })),
  ]
  const activeTab = tabs.find((tab) => tab.id === category) ?? tabs[0]

  return (
    <div className="flex flex-col gap-5">
      <HeroBanner featured={featured} />

      <BigWins />

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ChipTabs
            items={tabs}
            value={category}
            onChange={setCategory}
            label="Browse by category"
            className="min-w-0 flex-1"
          />
          <SeeAll to={category === 'all' ? paths.games : `${paths.games}?category=${category}`} />
        </div>

        {gamesQuery.isPending ? (
          <SkeletonGrid count={6} className={gameGrid} />
        ) : gamesQuery.isError ? (
          <ErrorState message={gamesQuery.error.message} onRetry={() => void gamesQuery.refetch()} />
        ) : gamesQuery.data.length === 0 ? (
          <p className="rounded-card bg-surface-1 px-4 py-6 text-center text-[13.5px] text-ink-mute">
            Nothing in this category yet.
          </p>
        ) : (
          <GameGrid games={gamesQuery.data} label={activeTab?.label ?? 'All games'} />
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">Promotions</h2>
        <FutureDevelopment />
      </section>

      {user && recentlyPlayedQuery.isPending ? (
        <SkeletonGrid count={4} className={gameGrid} />
      ) : user && recentlyPlayedQuery.isError ? (
        <ErrorState
          title="Recently played unavailable"
          message={recentlyPlayedQuery.error.message}
          onRetry={() => void recentlyPlayedQuery.refetch()}
        />
      ) : recentlyPlayedQuery.data && recentlyPlayedQuery.data.length > 0 ? (
        <GameRow title="Recently Played" categorySlug={null} games={recentlyPlayedQuery.data} />
      ) : null}
    </div>
  )
}
