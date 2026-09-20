import { api, ApiError } from '@/api/client'
import { mockRequest, type Page } from '@/api/mock'
import { testFixturesEnabled } from '@/api/mode'
import type { Category, Game, GameFlag } from '@/api/types'

const usingTestFixtures = import.meta.env.MODE === 'test' && testFixturesEnabled

export type GameFilters = {
  category: string
  search: string
  sort: 'name' | 'newest'
  flag?: GameFlag
}

// The contract caps a page at 100. The catalogue is far smaller today; when it
// grows past that the screens need paging, not a bigger number here.
const CATALOGUE_PAGE_SIZE = 100

export async function fetchCategories(): Promise<Category[]> {
  if (usingTestFixtures) {
    const { categories } = await import('@/mocks/games')
    return mockRequest(() => categories.filter((category) => category.available))
  }
  const all = await api.get<Category[]>('/categories')
  return all.filter((category) => category.available)
}

export async function fetchRecentlyPlayed(): Promise<Game[]> {
  if (usingTestFixtures) {
    const { games, recentlyPlayedIds } = await import('@/mocks/games')
    return mockRequest(() =>
      recentlyPlayedIds
        .map((id) => games.find((game) => game.id === id))
        .filter((game): game is Game => Boolean(game)),
    )
  }
  const page = await api.get<Page<Game>>(`/recent-games?page=1&size=${CATALOGUE_PAGE_SIZE}`)
  return page.rows
}

export async function fetchFavorites(): Promise<Game[]> {
  if (usingTestFixtures) {
    const { favoriteIds, games } = await import('@/mocks/games')
    return mockRequest(() => games.filter((game) => favoriteIds.has(game.id)))
  }
  const page = await api.get<Page<Game>>(`/favorites?page=1&size=${CATALOGUE_PAGE_SIZE}`)
  return page.rows
}

export async function setFavorite({ slug, favorite }: { slug: string; favorite: boolean }): Promise<void> {
  if (usingTestFixtures) {
    const { favoriteIds, games } = await import('@/mocks/games')
    return mockRequest(() => {
      const game = games.find((entry) => entry.slug === slug)
      if (!game) return
      if (favorite) favoriteIds.add(game.id)
      else favoriteIds.delete(game.id)
    })
  }
  const path = `/games/${encodeURIComponent(slug)}/favorite`
  if (favorite) await api.put<void>(path)
  else await api.delete<void>(path)
}

export async function fetchGames(filters: GameFilters): Promise<Game[]> {
  if (usingTestFixtures) {
    const { games } = await import('@/mocks/games')
    return mockRequest(() => {
      const search = filters.search.trim().toLowerCase()

      const matched = games.filter((game) => {
        const inCategory = filters.category === 'all' || game.category_slug === filters.category
        const matchesSearch =
          search === '' ||
          game.name.toLowerCase().includes(search) ||
          game.category_name.toLowerCase().includes(search)
        const flagged = filters.flag === undefined || game.flags.includes(filters.flag)
        return inCategory && matchesSearch && flagged
      })

      return filters.sort === 'name'
        ? [...matched].sort((a, b) => a.name.localeCompare(b.name))
        : [...matched].reverse()
    })
  }

  const params = new URLSearchParams({
    page: '1',
    size: String(CATALOGUE_PAGE_SIZE),
    sort: filters.sort,
  })
  if (filters.category !== 'all') params.set('category', filters.category)
  if (filters.search.trim() !== '') params.set('search', filters.search.trim())
  if (filters.flag) params.set('flag', filters.flag)

  const page = await api.get<Page<Game>>(`/games?${params.toString()}`)
  return page.rows
}

export async function fetchGame(slug: string): Promise<Game | null> {
  if (usingTestFixtures) {
    const { games } = await import('@/mocks/games')
    return mockRequest(() => games.find((game) => game.slug === slug) ?? null)
  }
  try {
    return await api.get<Game>(`/games/${encodeURIComponent(slug)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}
