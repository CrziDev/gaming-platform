import { api, ApiError } from '@/api/client'
import { mockRequest, paginate, type Page } from '@/api/mock'
import { usingFixtures } from '@/api/mode'
import type {
  CurrencyMetadata,
  DepositRequest,
  Notification,
  PaymentMethod,
  Round,
  Transaction,
  Wallet,
} from '@/api/types'
import type { Currency } from '@/lib/money'
import {
  currencies,
  depositRequests,
  notifications,
  paymentMethods,
  rounds,
  transactions,
  wallets,
} from '@/mocks/wallet'

export type HistoryKind = 'all' | 'deposit' | 'rounds' | 'adjustment'

export type HistoryFilter = {
  kind: HistoryKind
  days: 7 | 30 | 90
  page: number
  // Narrows the ledger to one wallet. Absent, every wallet's movements are
  // listed and each row carries its own currency.
  currency?: Currency
}

function matchesKind(kind: HistoryKind, transaction: Transaction): boolean {
  if (kind === 'all') return true
  if (kind === 'rounds') return transaction.kind === 'wager' || transaction.kind === 'win'
  return transaction.kind === kind
}

export const HISTORY_PAGE_SIZE = 20

export async function fetchCurrencies(): Promise<CurrencyMetadata[]> {
  if (usingFixtures) {
    return mockRequest(() => currencies.map((entry) => ({ ...entry })))
  }
  return api.get<CurrencyMetadata[]>('/currencies')
}

export async function fetchWallets(): Promise<Wallet[]> {
  if (usingFixtures) {
    return mockRequest(() => wallets.map((entry) => ({ ...entry })))
  }
  return api.get<Wallet[]>('/wallets')
}

export async function fetchWallet(currency: Currency): Promise<Wallet> {
  if (usingFixtures) {
    return mockRequest(() => {
      const held = wallets.find((entry) => entry.currency === currency)
      // The server provisions a wallet on read, so an unfunded currency is a zero
      // balance rather than a missing resource.
      return held ? { ...held } : { currency, balance_minor: 0 }
    })
  }
  return api.get<Wallet>(`/wallets/${currency}`)
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  if (usingFixtures) {
    return mockRequest(() => paymentMethods.filter((method) => method.enabled))
  }
  const methods = await api.get<Omit<PaymentMethod, 'enabled'>[]>('/payment-methods')
  return methods.map((method) => ({ ...method, enabled: true }))
}

export type DepositLimits = {
  currency: Currency
  min_minor: number
  max_minor: number
}

export async function fetchDepositLimits(currency: Currency): Promise<DepositLimits> {
  const metadata = (await fetchCurrencies()).find((candidate) => candidate.code === currency)
  if (!metadata) {
    throw new Error(`Currency ${currency} is not enabled for deposits`)
  }
  return {
    currency: metadata.code,
    min_minor: metadata.deposit_min_minor,
    max_minor: metadata.deposit_max_minor,
  }
}

export async function fetchPendingDeposit(): Promise<DepositRequest | null> {
  if (usingFixtures) {
    return mockRequest(
      () =>
        [...depositRequests]
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .find((request) => request.status === 'pending') ?? null,
    )
  }
  const page = await api.get<Page<DepositRequest>>('/deposits?status=pending&page=1&size=1')
  return page.rows[0] ?? null
}

export async function fetchDeposit(id: string): Promise<DepositRequest | null> {
  if (usingFixtures) {
    return mockRequest(() => depositRequests.find((request) => request.id === id) ?? null)
  }
  try {
    return await api.get<DepositRequest>(`/deposits/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
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
  if (usingFixtures) {
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

export async function fetchTransactions(filter: HistoryFilter): Promise<Page<Transaction>> {
  if (usingFixtures) {
    return mockRequest(() => {
      const cutoff = Date.now() - filter.days * 86_400_000
      const matched = transactions.filter((transaction) => {
        const inRange = Date.parse(transaction.created_at) >= cutoff
        const inWallet = !filter.currency || transaction.currency === filter.currency
        return inRange && inWallet && matchesKind(filter.kind, transaction)
      })
      return paginate(matched, filter.page, HISTORY_PAGE_SIZE)
    })
  }

  // Rounds are not a ledger kind the server can filter on, and no round has
  // been played until the round APIs exist; the tab is honest about that.
  if (filter.kind === 'rounds') {
    return paginate<Transaction>([], 1, HISTORY_PAGE_SIZE)
  }

  const params = new URLSearchParams({
    page: String(filter.page),
    size: String(HISTORY_PAGE_SIZE),
    from: new Date(Date.now() - filter.days * 86_400_000).toISOString(),
  })
  if (filter.kind !== 'all') params.set('type', filter.kind)
  if (filter.currency) params.set('currency', filter.currency)

  const response = await api.get<Page<BackendTransaction>>(`/transactions?${params.toString()}`)
  return { ...response, rows: response.rows.map(toTransaction) }
}

type BackendTransaction = {
  id: string
  kind: Transaction['kind']
  amount_minor: number
  currency: Currency
  created_at: string
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

export async function fetchRecentRounds(): Promise<Round[]> {
  if (usingFixtures) {
    return mockRequest(() => rounds.slice(0, 6))
  }
  return []
}

export async function fetchNotifications(): Promise<Notification[]> {
  if (usingFixtures) {
    return mockRequest(() => [...notifications])
  }
  return []
}

export async function markNotificationsRead(): Promise<void> {
  if (!usingFixtures) {
    return
  }
  return mockRequest(() => {
    for (const notification of notifications) {
      notification.read = true
    }
  }, 120)
}
