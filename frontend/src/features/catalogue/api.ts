import { mockRequest } from '@/api/mock'
import type { Category, Game, LobbyRow } from '@/api/types'
import { categories, games, lobbyRows } from '@/mocks/games'

export type GameFilters = {
  category: string
  search: string
  sort: 'name' | 'newest'
}

export async function fetchCategories(): Promise<Category[]> {
  return mockRequest(() => categories.filter((category) => category.available))
}

export async function fetchLobbyRows(signedIn: boolean): Promise<LobbyRow[]> {
  return mockRequest(() => lobbyRows(signedIn))
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
      return inCategory && matchesSearch
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
