import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import {
  adminLogin,
  confirmPasswordReset,
  fetchCurrentUser,
  login,
  logout,
  register,
  requestPasswordReset,
} from './api'
import { clearSessionExpired } from './expiry'

export const sessionQueryKey = ['session'] as const

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchCurrentUser,
    retry: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      clearSessionExpired()
      dropGuestQueries(queryClient)
      queryClient.setQueryData(sessionQueryKey, user)
    },
  })
}

export function useAdminLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: adminLogin,
    onSuccess: (user) => {
      clearSessionExpired()
      dropGuestQueries(queryClient)
      queryClient.setQueryData(sessionQueryKey, user)
    },
  })
}

export function useRegister() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: register,
    onSuccess: (user) => {
      clearSessionExpired()
      dropGuestQueries(queryClient)
      queryClient.setQueryData(sessionQueryKey, user)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      clearSessionExpired()

      dropGuestQueries(queryClient)
      queryClient.setQueryData(sessionQueryKey, null)
    },
  })
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: requestPasswordReset })
}

export function useConfirmPasswordReset() {
  return useMutation({ mutationFn: confirmPasswordReset })
}

// Anything fetched before the session changed was scoped to the old identity:
// a guest's failed wallet read must not linger as the player's wallet.
function dropGuestQueries(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== sessionQueryKey[0],
  })
}
