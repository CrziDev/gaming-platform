import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { adminLogin, fetchCurrentUser, login, logout, register } from './api'
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

      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== sessionQueryKey[0],
      })

      queryClient.setQueryData(sessionQueryKey, null)
    },
  })
}
