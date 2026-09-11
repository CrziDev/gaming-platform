import { useState } from 'react'

import { BigWins } from '@/components/catalogue/BigWins'
import { GameGrid, gameGrid } from '@/components/catalogue/GameGrid'
import { GameRow, SeeAll } from '@/components/catalogue/GameRow'
import { HeroBanner } from '@/components/catalogue/HeroBanner'
import { Promotions } from '@/components/catalogue/Promotions'
import { SkeletonGrid } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { ChipTabs, type TabItem } from '@/components/ui/Tabs'
import { useSession } from '@/features/auth'
import {
  gamesByIds,
  useBigWins,
  useCategories,
  useGames,
  useLobbyRows,
  usePromotions,
} from '@/features/catalogue'
import { paths } from '@/routes/paths'

export function LobbyPage() {
  const { data: user } = useSession()
  const [category, setCategory] = useState('all')
  const rowsQuery = useLobbyRows(Boolean(user))
  const categoriesQuery = useCategories()
  const featuredQuery = useGames({ category: 'all', search: '', sort: 'name' })
  const gamesQuery = useGames({ category, search: '', sort: 'name' })
  const winsQuery = useBigWins()
  const promotionsQuery = usePromotions()

  if (rowsQuery.isError) {
    return <ErrorState message={rowsQuery.error.message} onRetry={() => void rowsQuery.refetch()} />
  }

  const tabs: TabItem<string>[] = [
    { id: 'all', label: 'All games' },
    ...(categoriesQuery.data ?? []).map((entry) => ({ id: entry.slug, label: entry.name })),
  ]
  const activeTab = tabs.find((tab) => tab.id === category) ?? tabs[0]

  return (
    <div className="flex flex-col gap-5">
      <HeroBanner featured={featuredQuery.data?.[0]} />

      <BigWins wins={winsQuery.data ?? []} />

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

      <Promotions promotions={promotionsQuery.data ?? []} />

      {rowsQuery.isPending ? (
        <SkeletonGrid count={4} className={gameGrid} />
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
    </div>
  )
}
