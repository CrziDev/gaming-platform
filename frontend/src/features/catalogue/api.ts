import { api, ApiError } from '@/api/client'
import { mockRequest, type Page } from '@/api/mock'
import { usingFixtures } from '@/api/mode'
import type { BigWin, Category, Game, GameFlag, LobbyRow, Promotion } from '@/api/types'
import { bigWins, categories, favoriteIds, games, lobbyRows, promotions } from '@/mocks/games'

// The catalogue, a single game, the category list, and favorites are real
// reads. Big wins, promotions, and lobby rows have no service yet, so outside
// the demo and tests they are empty and their sections do not render.

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
  if (usingFixtures) {
    return mockRequest(() => categories.filter((category) => category.available))
  }
  const all = await api.get<Category[]>('/categories')
  return all.filter((category) => category.available)
}

export async function fetchLobbyRows(signedIn: boolean): Promise<LobbyRow[]> {
  if (!usingFixtures) return []
  return mockRequest(() => lobbyRows(signedIn))
}

export async function fetchBigWins(): Promise<BigWin[]> {
  if (!usingFixtures) return []
  return mockRequest(() => [...bigWins])
}

export async function fetchPromotions(): Promise<Promotion[]> {
  if (!usingFixtures) return []
  return mockRequest(() => [...promotions])
}

export async function fetchFavorites(): Promise<Game[]> {
  if (usingFixtures) {
    return mockRequest(() => games.filter((game) => favoriteIds.has(game.id)))
  }
  const page = await api.get<Page<Game>>(`/favorites?page=1&size=${CATALOGUE_PAGE_SIZE}`)
  return page.rows
}

export async function setFavorite({ slug, favorite }: { slug: string; favorite: boolean }): Promise<void> {
  if (usingFixtures) {
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
  if (usingFixtures) {
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

  // "Hot" needs round data to mean anything, and no round has been played
  // until the engine exists; the shelf is honest about that.
  if (filters.flag === 'hot') {
    return []
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
  if (usingFixtures) {
    return mockRequest(() => games.find((game) => game.slug === slug) ?? null)
  }
  try {
    return await api.get<Game>(`/games/${encodeURIComponent(slug)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function fetchGamesByIds(ids: string[]): Promise<Game[]> {
  if (!usingFixtures) return []
  return mockRequest(() =>
    ids.map((id) => games.find((game) => game.id === id)).filter((game): game is Game => Boolean(game)),
  )
}
