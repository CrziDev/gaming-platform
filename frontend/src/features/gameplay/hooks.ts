import { useMutation, useQuery } from '@tanstack/react-query'

import { useRemembered } from '@/lib/remembered'

import { fetchGameManifest, playRound } from './api'

export const gameManifestQueryKey = (slug: string) => ['game-manifest', slug] as const

export function useGameManifest(slug: string, enabled: boolean) {
  return useQuery({ queryKey: gameManifestQueryKey(slug), queryFn: () => fetchGameManifest(slug), enabled })
}

// Settlement is revealed when the ball lands, so the mutation itself refreshes
// nothing; the session decides when the wallet and rounds are refetched.
export function usePlayRound() {
  return useMutation({ mutationFn: playRound })
}

export function useGameSound() {
  return useRemembered('game.sound', true)
}
