import { mockRequest, paginate, type Page } from '@/api/mock'
import type {
  DepositRequest,
  Notification,
  PaymentMethod,
  Transaction,
  Wallet,
} from '@/api/types'
import type { Currency } from '@/lib/money'
import {
  depositLimits,
  depositRequests,
  notifications,
  paymentMethods,
  transactions,
  wallets,
  walletSummary,
} from '@/mocks/wallet'

export type HistoryKind = 'all' | 'deposit' | 'rounds' | 'adjustment'

export type HistoryFilter = {
  kind: HistoryKind
  days: 7 | 30 | 90
  page: number
}

function matchesKind(kind: HistoryKind, transaction: Transaction): boolean {
  if (kind === 'all') return true
  if (kind === 'rounds') return transaction.kind === 'wager' || transaction.kind === 'win'
  return transaction.kind === kind
}

export const HISTORY_PAGE_SIZE = 20

export async function fetchWallets(): Promise<Wallet[]> {
  return mockRequest(() => wallets.map((entry) => ({ ...entry })))
}

export async function fetchWallet(currency: Currency): Promise<Wallet> {
  return mockRequest(() => {
    const held = wallets.find((entry) => entry.currency === currency)
    // The server provisions a wallet on read, so an unfunded currency is a zero
    // balance rather than a missing resource.
    return held ? { ...held } : { currency, balance_minor: 0 }
  })
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  return mockRequest(() => paymentMethods.filter((method) => method.enabled))
}

export async function fetchDepositLimits() {
  return mockRequest(() => depositLimits)
}

export async function fetchDeposits(): Promise<DepositRequest[]> {
  return mockRequest(() =>
    [...depositRequests].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
  )
}

export async function fetchDeposit(id: string): Promise<DepositRequest | null> {
  return mockRequest(() => depositRequests.find((request) => request.id === id) ?? null)
}

export type NewDeposit = {
  method_id: string
  amount_minor: number
  reference: string
  // Which wallet the request funds. A player may hold several, and nothing
  // converts between them, so the currency is chosen here rather than inferred.
  currency: Currency
}

export async function submitDeposit(input: NewDeposit): Promise<DepositRequest> {
  return mockRequest(() => {
    const method = paymentMethods.find((candidate) => candidate.id === input.method_id)
    const reference = input.reference.trim()
    const created: DepositRequest = {
      id: `dep-${reference}`,
      reference,
      method_id: input.method_id,
      method_name: method?.name ?? 'Method A',
      amount_minor: input.amount_minor,
      currency: input.currency,
      status: 'pending',
      created_at: new Date().toISOString(),
      reviewed_at: null,
      reason: null,
    }

    depositRequests.unshift(created)
    transactions.unshift({
      id: `tx-${created.id}`,
      kind: 'deposit',
      label: `Deposit · ${created.method_name}`,
      reference: created.reference,
      status: 'pending',
      amount_minor: created.amount_minor,
      currency: created.currency,
      created_at: created.created_at,
      round_id: null,
    })

    return created
  }, 600)
}

export async function cancelDeposit(id: string): Promise<void> {
  return mockRequest(() => {
    const index = depositRequests.findIndex((request) => request.id === id)
    if (index >= 0) {
      depositRequests.splice(index, 1)
    }
    const transactionIndex = transactions.findIndex((transaction) => transaction.id === `tx-${id}`)
    if (transactionIndex >= 0) {
      transactions.splice(transactionIndex, 1)
    }
  })
}

export async function fetchTransactions(filter: HistoryFilter): Promise<Page<Transaction>> {
  return mockRequest(() => {
    const cutoff = Date.now() - filter.days * 86_400_000
    const matched = transactions.filter((transaction) => {
      const inRange = Date.parse(transaction.created_at) >= cutoff
      return inRange && matchesKind(filter.kind, transaction)
    })
    return paginate(matched, filter.page, HISTORY_PAGE_SIZE)
  })
}

export async function fetchWalletSummary() {
  return mockRequest(() => walletSummary)
}

export async function fetchNotifications(): Promise<Notification[]> {
  return mockRequest(() => [...notifications])
}

export async function markNotificationsRead(): Promise<void> {
  return mockRequest(() => {
    for (const notification of notifications) {
      notification.read = true
    }
  }, 120)
}
