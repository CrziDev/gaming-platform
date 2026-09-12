import { mockRequest } from '@/api/mock'
import type { BigWin, Category, Game, GameFlag, LobbyRow, Promotion } from '@/api/types'
import { bigWins, categories, favoriteIds, games, lobbyRows, promotions } from '@/mocks/games'

export type GameFilters = {
  category: string
  search: string
  sort: 'name' | 'newest'
  flag?: GameFlag
}

export async function fetchCategories(): Promise<Category[]> {
  return mockRequest(() => categories.filter((category) => category.available))
}

export async function fetchLobbyRows(signedIn: boolean): Promise<LobbyRow[]> {
  return mockRequest(() => lobbyRows(signedIn))
}

export async function fetchBigWins(): Promise<BigWin[]> {
  return mockRequest(() => [...bigWins])
}

export async function fetchPromotions(): Promise<Promotion[]> {
  return mockRequest(() => [...promotions])
}

export async function fetchFavorites(): Promise<Game[]> {
  return mockRequest(() => games.filter((game) => favoriteIds.has(game.id)))
}

export async function toggleFavorite(gameId: string): Promise<{ favorite: boolean }> {
  return mockRequest(() => {
    if (favoriteIds.has(gameId)) {
      favoriteIds.delete(gameId)
      return { favorite: false }
    }
    favoriteIds.add(gameId)
    return { favorite: true }
  })
}

export async function fetchGames(filters: GameFilters): Promise<Game[]> {
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

export async function fetchGame(slug: string): Promise<Game | null> {
  return mockRequest(() => games.find((game) => game.slug === slug) ?? null)
}

export async function fetchGamesByIds(ids: string[]): Promise<Game[]> {
  return mockRequest(() =>
    ids.map((id) => games.find((game) => game.id === id)).filter((game): game is Game => Boolean(game)),
  )
}
