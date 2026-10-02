import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { WithdrawalStatus } from '@/api/types'
import type { Currency } from '@/lib/money'

import { useActiveCurrency } from './activeCurrency'

import {
  fetchCurrencies,
  fetchDeposit,
  fetchDepositLimits,
  fetchNotifications,
  fetchPaymentMethods,
  fetchPendingDeposits,
  fetchRecentRounds,
  fetchRounds,
  fetchTransactions,
  fetchWallet,
  fetchWalletSummary,
  fetchWallets,
  fetchWithdrawal,
  fetchWithdrawalLimits,
  fetchWithdrawals,
  markNotificationsRead,
  cancelWithdrawal,
  submitDeposit,
  submitWithdrawal,
  type HistoryFilter,
  type SummaryFilter,
} from './api'

export const walletQueryKey = ['wallets'] as const

export function useCurrencies() {
  return useQuery({ queryKey: ['currencies'], queryFn: fetchCurrencies })
}

export function useWallets() {
  return useQuery({ queryKey: walletQueryKey, queryFn: fetchWallets })
}

export function useWallet(currency: Currency, enabled = true) {
  return useQuery({
    queryKey: [...walletQueryKey, currency],
    queryFn: () => fetchWallet(currency),
    enabled,
  })
}

export function useActiveWallet(enabled = true) {
  return useWallet(useActiveCurrency(), enabled)
}

export function usePaymentMethods() {
  return useQuery({ queryKey: ['payment-methods'], queryFn: fetchPaymentMethods })
}

export function useDepositLimits() {
  const currency = useActiveCurrency()
  return useQuery({
    queryKey: ['deposit-limits', currency],
    queryFn: () => fetchDepositLimits(currency),
  })
}

export function usePendingDeposits() {
  return useQuery({ queryKey: ['deposits', 'pending'], queryFn: fetchPendingDeposits })
}

export function useDeposit(id: string) {
  return useQuery({ queryKey: ['deposit', id], queryFn: () => fetchDeposit(id) })
}

export function useSubmitDeposit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: submitDeposit,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deposits'] })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useWithdrawalLimits() {
  const currency = useActiveCurrency()
  return useQuery({
    queryKey: ['withdrawal-limits', currency],
    queryFn: () => fetchWithdrawalLimits(currency),
  })
}

export function useWithdrawals(status?: WithdrawalStatus) {
  return useQuery({ queryKey: ['withdrawals', status ?? 'all'], queryFn: () => fetchWithdrawals(status) })
}

export function useWithdrawal(id: string) {
  return useQuery({ queryKey: ['withdrawals', 'one', id], queryFn: () => fetchWithdrawal(id) })
}

// A request debits the wallet and a cancel credits it back, so both refresh
// the balance and the ledger along with the requests themselves.
function useWithdrawalMutation<TInput>(mutationFn: (input: TInput) => ReturnType<typeof submitWithdrawal>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['withdrawals'] })
      void queryClient.invalidateQueries({ queryKey: walletQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useSubmitWithdrawal() {
  return useWithdrawalMutation(submitWithdrawal)
}

export function useCancelWithdrawal() {
  return useWithdrawalMutation(cancelWithdrawal)
}

export function useTransactions(filter: HistoryFilter, enabled = true) {
  return useQuery({ queryKey: ['transactions', filter], queryFn: () => fetchTransactions(filter), enabled })
}

// Keyed under 'transactions' so every invalidation that refreshes the ledger
// refreshes its totals in the same breath.
export function useWalletSummary(filter: SummaryFilter) {
  return useQuery({
    queryKey: ['transactions', 'summary', filter],
    queryFn: () => fetchWalletSummary(filter),
  })
}

export function useRounds(filter: Parameters<typeof fetchRounds>[0], enabled = true) {
  return useQuery({ queryKey: ['rounds', filter], queryFn: () => fetchRounds(filter), enabled })
}

export function useRecentRounds(gameId: string, currency: Currency) {
  return useQuery({
    queryKey: ['rounds', 'recent', gameId, currency],
    queryFn: () => fetchRecentRounds(gameId, currency),
    enabled: gameId !== '',
  })
}

// A review lands while the player is elsewhere, so the bell re-reads on a
// slow clock; a settled round refreshes it directly through the game session.
export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    enabled,
    refetchInterval: 60_000,
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
