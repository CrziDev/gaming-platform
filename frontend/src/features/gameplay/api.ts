import { api } from '@/api/client'
import { mockRequest } from '@/api/mock'
import { testFixturesEnabled } from '@/api/mode'
import type { PlayRoundRequest, PlayRoundResponse } from '@/api/types'
import type { Currency } from '@/lib/money'

import type { PlinkoParams } from './multipliers'
import { playRoundResponseSchema, plinkoManifestSchema, type PlinkoBoards } from './schemas'

const usingTestFixtures = import.meta.env.MODE === 'test' && testFixturesEnabled

// The board a game is configured with comes from the server's manifest and
// nowhere else. A 404 or 409 propagates: the session turns it into the frame's
// error state, and until a manifest has parsed no bet is offered.
export async function fetchGameManifest(slug: string): Promise<PlinkoBoards> {
  if (usingTestFixtures) {
    const { plinkoManifest } = await import('@/mocks/plinko')
    return plinkoManifestSchema.parse(await mockRequest(plinkoManifest))
  }
  const response = await api.get<unknown>(`/games/${encodeURIComponent(slug)}/manifest`)
  return plinkoManifestSchema.parse(response)
}

export type PlayRoundInput = {
  slug: string
  stake_minor: number
  currency: Currency
  params: PlinkoParams
  idempotencyKey: string
}

export async function playRound(input: PlayRoundInput): Promise<PlayRoundResponse> {
  if (usingTestFixtures) {
    const { settlePlinkoRound } = await import('@/mocks/plinko')
    return mockRequest(
      () =>
        settlePlinkoRound({
          stake_minor: input.stake_minor,
          currency: input.currency,
          params: input.params,
          idempotencyKey: input.idempotencyKey,
        }),
      260,
    )
  }

  const body: PlayRoundRequest = {
    stake_minor: input.stake_minor,
    currency: input.currency,
    params: { ...input.params },
  }
  const response = await api.post<unknown>(`/games/${encodeURIComponent(input.slug)}/rounds`, body, {
    headers: { 'Idempotency-Key': input.idempotencyKey },
  })
  return playRoundResponseSchema.parse(response)
}
