import { QueryCache, QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/api/client'
import { sessionQueryKey } from '@/features/auth'
import { noteSession, reportSessionExpired } from '@/features/auth/expiry'

export function createQueryClient(): QueryClient {
  const handleUnauthorized = (error: unknown) => {
    if (!(error instanceof ApiError) || !error.isUnauthenticated) {
      return
    }
    if (client.getQueryData(sessionQueryKey)) {
      reportSessionExpired()
    }
    client.setQueryData(sessionQueryKey, null)
  }

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleUnauthorized }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status < 500) {
            return false
          }
          return failureCount < 2
        },
      },
      mutations: { retry: false },
    },
  })

  client.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] === sessionQueryKey[0]) {
      noteSession(event.query.state.data)
    }
  })

  return client
}
