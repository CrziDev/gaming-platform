import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import { createQueryClient } from '@/app/queryClient'
import { sessionQueryKey } from '@/features/auth'
import { userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the global unauthorized handler', () => {
  it('demotes the session to anonymous when any read comes back 401', async () => {
    const client = createQueryClient()
    client.setQueryData(sessionQueryKey, userBody())

    await client
      .fetchQuery({
        queryKey: ['anything'],
        queryFn: async () => {
          throw new ApiError(401, 'Authentication is required')
        },
      })
      .catch(() => undefined)

    expect(client.getQueryData(sessionQueryKey)).toBeNull()
  })

  it('leaves the session alone for any other failure', async () => {
    const client = createQueryClient()
    client.setQueryData(sessionQueryKey, userBody())

    await client
      .fetchQuery({
        queryKey: ['anything'],
        queryFn: async () => {
          throw new ApiError(500, 'An unexpected error occurred')
        },
      })
      .catch(() => undefined)

    expect(client.getQueryData(sessionQueryKey)).toEqual(userBody())
  })
})
