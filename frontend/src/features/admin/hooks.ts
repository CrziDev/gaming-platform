import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AccountStatus } from '@/api/types'

import {
  adjustWallet,
  fetchAdminGame,
  fetchAdminGames,
  fetchAdminPaymentMethods,
  fetchAdminRounds,
  fetchAllDeposits,
  fetchAuditEntries,
  fetchConsoleAlerts,
  fetchDashboard,
  fetchDepositQueue,
  fetchRtpProfiles,
  fetchStaff,
  fetchUser,
  fetchUserAdjustments,
  fetchUserCounts,
  fetchUserDeposits,
  fetchUserRounds,
  fetchUsers,
  reviewDeposit,
  setUserStatus,
  type UserFilter,
} from './api'

export function useDashboard() {
  return useQuery({ queryKey: ['admin', 'dashboard'], queryFn: fetchDashboard })
}

export function useConsoleAlerts() {
  return useQuery({ queryKey: ['admin', 'alerts'], queryFn: fetchConsoleAlerts })
}

export function useAuditEntries(limit?: number) {
  return useQuery({ queryKey: ['admin', 'audit', limit], queryFn: () => fetchAuditEntries(limit) })
}

export function useDepositQueue() {
  return useQuery({ queryKey: ['admin', 'deposit-queue'], queryFn: fetchDepositQueue })
}

export function useAllDeposits() {
  return useQuery({ queryKey: ['admin', 'deposits'], queryFn: fetchAllDeposits })
}

export function useReviewDeposit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reviewDeposit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminUsers(filter: UserFilter) {
  return useQuery({ queryKey: ['admin', 'users', filter], queryFn: () => fetchUsers(filter) })
}

export function useUserCounts() {
  return useQuery({ queryKey: ['admin', 'user-counts'], queryFn: fetchUserCounts })
}

export function useAdminUser(id: string) {
  return useQuery({ queryKey: ['admin', 'user', id], queryFn: () => fetchUser(id) })
}

export function useUserRounds(id: string) {
  return useQuery({ queryKey: ['admin', 'user', id, 'rounds'], queryFn: fetchUserRounds })
}

export function useUserDeposits(id: string) {
  return useQuery({ queryKey: ['admin', 'user', id, 'deposits'], queryFn: () => fetchUserDeposits(id) })
}

export function useUserAdjustments(id: string) {
  return useQuery({
    queryKey: ['admin', 'user', id, 'adjustments'],
    queryFn: () => fetchUserAdjustments(id),
  })
}

export function useAdjustWallet() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: adjustWallet,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useSetUserStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AccountStatus }) => setUserStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminGames() {
  return useQuery({ queryKey: ['admin', 'games'], queryFn: fetchAdminGames })
}

export function useAdminGame(id: string) {
  return useQuery({ queryKey: ['admin', 'game', id], queryFn: () => fetchAdminGame(id) })
}

export function useAdminRounds() {
  return useQuery({ queryKey: ['admin', 'rounds'], queryFn: fetchAdminRounds })
}

export function useRtpProfiles() {
  return useQuery({ queryKey: ['admin', 'rtp'], queryFn: fetchRtpProfiles })
}

export function useStaff() {
  return useQuery({ queryKey: ['admin', 'staff'], queryFn: fetchStaff })
}

export function useAdminPaymentMethods() {
  return useQuery({ queryKey: ['admin', 'payment-methods'], queryFn: fetchAdminPaymentMethods })
}
