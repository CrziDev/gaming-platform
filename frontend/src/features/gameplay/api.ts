import { api } from '@/api/client'
import { mockRequest } from '@/api/mock'
import { usingFixtures } from '@/api/mode'
import type { PlayRoundRequest, PlayRoundResponse } from '@/api/types'
import type { Currency } from '@/lib/money'
import { settlePlinkoRound } from '@/mocks/plinko'

import type { PlinkoParams } from './multipliers'
import { playRoundResponseSchema } from './schemas'

export type PlayRoundInput = {
  slug: string
  stake_minor: number
  currency: Currency
  params: PlinkoParams
  idempotencyKey: string
}

export async function playRound(input: PlayRoundInput): Promise<PlayRoundResponse> {
  if (usingFixtures) {
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
