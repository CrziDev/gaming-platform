import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchBigWins,
  fetchCategories,
  fetchFavorites,
  fetchGame,
  fetchGames,
  fetchGamesByIds,
  fetchLobbyRows,
  fetchPromotions,
  toggleFavorite,
  type GameFilters,
} from './api'

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
}

export function useLobbyRows(signedIn: boolean) {
  return useQuery({ queryKey: ['lobby', signedIn], queryFn: () => fetchLobbyRows(signedIn) })
}

export function useBigWins() {
  return useQuery({ queryKey: ['big-wins'], queryFn: fetchBigWins })
}

export function usePromotions() {
  return useQuery({ queryKey: ['promotions'], queryFn: fetchPromotions })
}

export function useGames(filters: GameFilters) {
  return useQuery({ queryKey: ['games', filters], queryFn: () => fetchGames(filters) })
}

export function useGame(slug: string) {
  return useQuery({ queryKey: ['game', slug], queryFn: () => fetchGame(slug) })
}

export function useFavorites(enabled: boolean) {
  return useQuery({ queryKey: ['favorites'], queryFn: fetchFavorites, enabled })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: toggleFavorite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  })
}

export function useGamesByIds(ids: string[]) {
  return useQuery({ queryKey: ['games', 'by-id', ids], queryFn: () => fetchGamesByIds(ids) })
}
