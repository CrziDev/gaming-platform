import { api, ApiError } from '@/api/client'
import { mockRequest, paginate, type Page } from '@/api/mock'
import { usingMockApi } from '@/api/mode'
import type {
  CurrencyMetadata,
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

// Component tests intentionally use the fixture dataset unless they explicitly
// exercise the transport layer. This keeps page tests deterministic while the
// production build honors VITE_API_MOCK=false.
const useRealWalletApi = !usingMockApi && import.meta.env.MODE !== 'test'

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
  if (useRealWalletApi) {
    return api.get<Wallet[]>('/wallets')
  }
  return mockRequest(() => wallets.map((entry) => ({ ...entry })))
}

export async function fetchWallet(currency: Currency): Promise<Wallet> {
  if (useRealWalletApi) {
    return api.get<Wallet>(`/wallets/${currency}`)
  }
  return mockRequest(() => {
    const held = wallets.find((entry) => entry.currency === currency)
    // The server provisions a wallet on read, so an unfunded currency is a zero
    // balance rather than a missing resource.
    return held ? { ...held } : { currency, balance_minor: 0 }
  })
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  if (useRealWalletApi) {
    const methods = await api.get<Omit<PaymentMethod, 'enabled'>[]>('/payment-methods')
    return methods.map((method) => ({ ...method, enabled: true }))
  }
  return mockRequest(() => paymentMethods.filter((method) => method.enabled))
}

export type DepositLimits = {
  currency: Currency
  min_minor: number
  max_minor: number
}

export async function fetchDepositLimits(currency: Currency): Promise<DepositLimits> {
  if (useRealWalletApi) {
    const currencies = await api.get<CurrencyMetadata[]>('/currencies')
    const metadata = currencies.find((candidate) => candidate.code === currency)
    if (!metadata) {
      throw new Error(`Currency ${currency} is not enabled for deposits`)
    }
    return {
      currency: metadata.code,
      min_minor: metadata.deposit_min_minor,
      max_minor: metadata.deposit_max_minor,
    }
  }
  return mockRequest(() => ({
    currency,
    min_minor: depositLimits.min_minor,
    max_minor: depositLimits.max_minor,
  }))
}

export async function fetchDeposits(): Promise<DepositRequest[]> {
  if (useRealWalletApi) {
    const page = await api.get<Page<DepositRequest>>('/deposits?page=1&size=100')
    return page.rows
  }
  return mockRequest(() =>
    [...depositRequests].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
  )
}

export async function fetchDeposit(id: string): Promise<DepositRequest | null> {
  if (useRealWalletApi) {
    try {
      return await api.get<DepositRequest>(`/deposits/${id}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  }
  return mockRequest(() => depositRequests.find((request) => request.id === id) ?? null)
}

export type NewDeposit = {
  method_id: string
  amount_minor: number
  reference: string
  // Which wallet the request funds. A player may hold several, and nothing
  // converts between them, so the currency is chosen here rather than inferred.
  currency: Currency
  proof: File
  idempotency_key: string
}

export async function submitDeposit(input: NewDeposit): Promise<DepositRequest> {
  if (useRealWalletApi) {
    const form = new FormData()
    form.append('method_id', input.method_id)
    form.append('amount_minor', String(input.amount_minor))
    form.append('reference', input.reference)
    form.append('currency', input.currency)
    form.append('proof', input.proof)
    return api.post<DepositRequest>('/deposits', form, {
      headers: { 'Idempotency-Key': input.idempotency_key },
    })
  }
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

export async function fetchTransactions(filter: HistoryFilter): Promise<Page<Transaction>> {
  if (useRealWalletApi) {
    const cutoff = new Date(Date.now() - filter.days * 86_400_000).toISOString()
    const response = await api.get<BackendTransactionPage>(
      `/transactions?page=1&size=100&from=${encodeURIComponent(cutoff)}`,
    )
    const matched = response.rows
      .map(toTransaction)
      .filter((transaction) => matchesKind(filter.kind, transaction))
    return paginate(matched, filter.page, HISTORY_PAGE_SIZE)
  }
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
  if (useRealWalletApi) {
    const currency = 'PHP' as Currency
    const history = await fetchTransactions({ kind: 'all', days: 30, page: 1 })
    return {
      currency,
      deposited_30d_minor: history.rows
        .filter((row) => row.kind === 'deposit')
        .reduce((total, row) => total + row.amount_minor, 0),
      staked_30d_minor: history.rows
        .filter((row) => row.kind === 'wager')
        .reduce((total, row) => total + Math.abs(row.amount_minor), 0),
      returned_30d_minor: history.rows
        .filter((row) => row.kind === 'win')
        .reduce((total, row) => total + row.amount_minor, 0),
    }
  }
  return mockRequest(() => walletSummary)
}

type BackendTransaction = {
  id: string
  kind: Transaction['kind']
  amount_minor: number
  currency: Currency
  created_at: string
}

type BackendTransactionPage = {
  rows: BackendTransaction[]
  total: number
  page: number
  size: number
  pages: number
}

function toTransaction(row: BackendTransaction): Transaction {
  return {
    id: row.id,
    kind: row.kind,
    label: row.kind.charAt(0).toUpperCase() + row.kind.slice(1),
    reference: row.id.slice(0, 8),
    status: 'applied',
    amount_minor: row.amount_minor,
    currency: row.currency,
    created_at: row.created_at,
    round_id: null,
  }
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
