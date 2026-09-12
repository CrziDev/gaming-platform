import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
  fetchTransactions,
  fetchWallet,
  fetchWallets,
  markNotificationsRead,
  submitDeposit,
  type HistoryFilter,
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

export function useTransactions(filter: HistoryFilter) {
  return useQuery({ queryKey: ['transactions', filter], queryFn: () => fetchTransactions(filter) })
}

export function useRecentRounds() {
  return useQuery({ queryKey: ['rounds', 'recent'], queryFn: fetchRecentRounds })
}

export function useNotifications(enabled = true) {
  return useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications, enabled })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
