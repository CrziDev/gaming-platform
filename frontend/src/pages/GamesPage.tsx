import { Layers, X } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { GameGrid, gameGrid } from '@/components/catalogue/GameGrid'
import { Select } from '@/components/ui/Field'
import { SkeletonGrid } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { ChipTabs, type TabItem } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { categoryIcon } from '@/components/shell/nav'
import type { GameFlag } from '@/api/types'
import { useCategories, useGames, type GameFilters } from '@/features/catalogue'

const shelves: Record<GameFlag, { title: string; empty: string }> = {
  hot: { title: 'Hot games', empty: 'Nothing is trending right now. The full catalogue is one tap away.' },
  new: { title: 'New games', empty: 'No new releases this week. The full catalogue is one tap away.' },
}

export function GamesPage({ flag }: { flag?: GameFlag }) {
  const [params, setParams] = useSearchParams()

  const category = params.get('category') ?? 'all'
  const search = params.get('q') ?? ''
  const sort = (params.get('sort') as GameFilters['sort']) ?? 'name'
  const shelf = flag ? shelves[flag] : undefined

  const categoriesQuery = useCategories()
  const gamesQuery = useGames({ category, search, sort, ...(flag ? { flag } : {}) })

  const tabs: TabItem<string>[] = [
    { id: 'all', label: 'All', icon: Layers },
    ...(categoriesQuery.data ?? []).map((entry) => ({
      id: entry.slug,
      label: entry.name,
      icon: categoryIcon(entry.slug),
      count: entry.game_count,
    })),
  ]

  const update = (next: Record<string, string>) => {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value === '' || (key === 'category' && value === 'all')) {
        merged.delete(key)
      } else {
        merged.set(key, value)
      }
    }
    setParams(merged, { replace: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{shelf?.title ?? 'Games'}</h1>

      <div className="flex flex-col gap-4">
        <ChipTabs
          items={tabs}
          value={category}
          onChange={(next) => update({ category: next })}
          label="Filter by category"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[12px] text-ink-mute">
              {gamesQuery.data?.length ?? 0} games
            </span>
            {search === '' ? null : (
              <button
                type="button"
                onClick={() => update({ q: '' })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-chip bg-surface-2 px-2.5 text-[12.5px] text-ink"
              >
                <span className="text-ink-mute">Search</span>
                {search}
                <X aria-hidden size={13} strokeWidth={1.5} className="text-ink-mute" />
                <span className="sr-only">Clear search</span>
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-mute">
            Sort
            <Select
              value={sort}
              onChange={(event) => update({ sort: event.target.value })}
              aria-label="Sort games"
              className="min-h-11 w-40"
            >
              <option value="name">A–Z</option>
              <option value="newest">Newest</option>
            </Select>
          </label>
        </div>
      </div>

      {gamesQuery.isPending ? (
        <SkeletonGrid count={6} className={gameGrid} />
      ) : gamesQuery.isError ? (
        <ErrorState message={gamesQuery.error.message} onRetry={() => void gamesQuery.refetch()} />
      ) : gamesQuery.data.length > 0 ? (
        <GameGrid games={gamesQuery.data} label={shelf?.title ?? 'Game catalogue'} />
      ) : (
        <EmptyState
          title="No games match"
          description={shelf?.empty ?? 'Nothing here yet. Clear the filters to see the full catalogue.'}
          action={
            <Button variant="secondary" size="sm" onClick={() => setParams(new URLSearchParams())}>
              Clear filters
            </Button>
          }
        />
      )}
    </div>
  )
}
