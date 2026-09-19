import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AccountStatus } from '@/api/types'
import type { Currency } from '@/lib/money'

import {
  adjustWallet,
  createGame,
  fetchAdminGame,
  fetchAdminGames,
  fetchAdminPaymentMethods,
  fetchAdminTransactions,
  fetchAdminRounds,
  fetchAdminRtpConfiguration,
  fetchAllCategories,
  fetchAuditEntries,
  fetchConsoleAlerts,
  fetchDashboard,
  fetchDepositQueue,
  fetchStaff,
  fetchUser,
  fetchUserAdjustments,
  fetchUserCounts,
  fetchUserDeposits,
  fetchUserRounds,
  fetchUserWallets,
  fetchUsers,
  reviewDeposit,
  setGameRtp,
  setUserStatus,
  updateGame,
  type GameInput,
  type GamePatch,
  type UserFilter,
} from './api'

export function useDashboard(currency: Currency) {
  return useQuery({
    queryKey: ['admin', 'dashboard', currency],
    queryFn: () => fetchDashboard(currency),
  })
}

export function useConsoleAlerts() {
  return useQuery({ queryKey: ['admin', 'alerts'], queryFn: fetchConsoleAlerts })
}

export function useAuditEntries(page = 1, size?: number) {
  return useQuery({
    queryKey: ['admin', 'audit', page, size],
    queryFn: () => fetchAuditEntries(page, size),
  })
}

export function useDepositQueue(page = 1, size?: number) {
  return useQuery({
    queryKey: ['admin', 'deposit-queue', page, size],
    queryFn: () => fetchDepositQueue(page, size),
  })
}

export function useReviewDeposit() {
  const queryClient = useQueryClient()

  // Settled, not success: a review that lost the race to another operator
  // still means the queue on screen is stale.
  return useMutation({
    mutationFn: reviewDeposit,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
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

export function useAdminUserWallets(id: string) {
  return useQuery({
    queryKey: ['admin', 'user', id, 'wallets'],
    queryFn: () => fetchUserWallets(id),
    enabled: id !== '',
  })
}

export function useUserRounds(id: string, page = 1) {
  return useQuery({
    queryKey: ['admin', 'user', id, 'rounds', page],
    queryFn: () => fetchUserRounds(id, page),
    enabled: id !== '',
  })
}

export function useUserDeposits(id: string, page = 1) {
  return useQuery({
    queryKey: ['admin', 'user', id, 'deposits', page],
    queryFn: () => fetchUserDeposits(id, page),
  })
}

export function useUserAdjustments(id: string, page = 1) {
  return useQuery({
    queryKey: ['admin', 'user', id, 'adjustments', page],
    queryFn: () => fetchUserAdjustments(id, page),
  })
}

export function useAdjustWallet() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: adjustWallet,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminTransactions(filter: Parameters<typeof fetchAdminTransactions>[0], enabled = true) {
  return useQuery({
    queryKey: ['admin', 'transactions', filter],
    queryFn: () => fetchAdminTransactions(filter),
    enabled,
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

export function useAdminRtpConfiguration(
  id: string,
  basisPoints: number | null,
  rows: number,
  risk: 'low' | 'normal' | 'high',
) {
  return useQuery({
    queryKey: ['admin', 'game', id, 'rtp-configuration', basisPoints, rows, risk],
    queryFn: () => fetchAdminRtpConfiguration(id, basisPoints ?? 0, rows, risk),
    enabled: id !== '' && basisPoints !== null,
  })
}

export function useAllCategories() {
  return useQuery({ queryKey: ['admin', 'categories'], queryFn: fetchAllCategories })
}

// A game edit reaches the player catalogue too: the public lists, the single
// game, and the category counts all read the same rows.
function useInvalidateCatalogue() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
      queryClient.invalidateQueries({ queryKey: ['games'] }),
      queryClient.invalidateQueries({ queryKey: ['game'] }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
    ])
}

export function useCreateGame() {
  const invalidate = useInvalidateCatalogue()
  return useMutation({ mutationFn: (input: GameInput) => createGame(input), onSuccess: invalidate })
}

export function useUpdateGame() {
  const invalidate = useInvalidateCatalogue()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: GamePatch }) => updateGame(id, patch),
    onSuccess: invalidate,
  })
}

export function useAdminRounds(filter: Parameters<typeof fetchAdminRounds>[0], enabled = true) {
  return useQuery({
    queryKey: ['admin', 'rounds', filter],
    queryFn: () => fetchAdminRounds(filter),
    enabled,
  })
}

export function useSetGameRtp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ gameId, basisPoints }: { gameId: string; basisPoints: number }) => setGameRtp(gameId, basisPoints),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useStaff() {
  return useQuery({ queryKey: ['admin', 'staff'], queryFn: fetchStaff })
}

export function useAdminPaymentMethods() {
  return useQuery({ queryKey: ['admin', 'payment-methods'], queryFn: fetchAdminPaymentMethods })
}
