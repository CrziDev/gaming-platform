import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Currency } from '@/lib/money'

import { useActiveCurrency } from './activeCurrency'

import {
  cancelDeposit,
  fetchDeposit,
  fetchDepositLimits,
  fetchDeposits,
  fetchNotifications,
  fetchPaymentMethods,
  fetchTransactions,
  fetchWallet,
  fetchWallets,
  fetchWalletSummary,
  markNotificationsRead,
  submitDeposit,
  type HistoryFilter,
} from './api'

export const walletQueryKey = ['wallets'] as const

export function useWallets() {
  return useQuery({ queryKey: walletQueryKey, queryFn: fetchWallets })
}

export function useWallet(currency: Currency) {
  return useQuery({
    queryKey: [...walletQueryKey, currency],
    queryFn: () => fetchWallet(currency),
  })
}

export function useActiveWallet() {
  return useWallet(useActiveCurrency())
}

export function usePaymentMethods() {
  return useQuery({ queryKey: ['payment-methods'], queryFn: fetchPaymentMethods })
}

export function useDepositLimits() {
  return useQuery({ queryKey: ['deposit-limits'], queryFn: fetchDepositLimits })
}

export function useDeposits() {
  return useQuery({ queryKey: ['deposits'], queryFn: fetchDeposits })
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

export function useCancelDeposit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: cancelDeposit,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deposits'] })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useTransactions(filter: HistoryFilter) {
  return useQuery({ queryKey: ['transactions', filter], queryFn: () => fetchTransactions(filter) })
}

export function useWalletSummary() {
  return useQuery({ queryKey: ['wallet-summary'], queryFn: fetchWalletSummary })
}

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
