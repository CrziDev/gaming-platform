import { useMutation } from '@tanstack/react-query'

import { useRemembered } from '@/lib/remembered'

import { playRound } from './api'

// Settlement is revealed when the ball lands, so the mutation itself refreshes
// nothing; the session decides when the wallet and rounds are refetched.
export function usePlayRound() {
  return useMutation({ mutationFn: playRound })
}

export function useGameSound() {
  return useRemembered('game.sound', true)
}
