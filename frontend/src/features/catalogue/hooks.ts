import { useQuery } from '@tanstack/react-query'

import { games } from '@/mocks/games'

import { fetchCategories, fetchGame, fetchGames, fetchLobbyRows, type GameFilters } from './api'

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
}

export function useLobbyRows(signedIn: boolean) {
  return useQuery({ queryKey: ['lobby', signedIn], queryFn: () => fetchLobbyRows(signedIn) })
}

export function useGames(filters: GameFilters) {
  return useQuery({ queryKey: ['games', filters], queryFn: () => fetchGames(filters) })
}

export function useGame(slug: string) {
  return useQuery({ queryKey: ['game', slug], queryFn: () => fetchGame(slug) })
}

export function gamesByIds(ids: string[]) {
  return ids
    .map((id) => games.find((game) => game.id === id))
    .filter((game): game is (typeof games)[number] => Boolean(game))
}
