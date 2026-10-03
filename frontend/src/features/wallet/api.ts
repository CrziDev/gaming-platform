import { api, ApiError } from '@/api/client'
import { mockRequest, paginate, type Page } from '@/api/mock'
import { testFixturesEnabled } from '@/api/mode'
import type {
  CurrencyMetadata,
  DepositRequest,
  DepositStatus,
  Notification,
  PaymentMethod,
  Round,
  Transaction,
  Wallet,
  WalletSummary,
  WithdrawalRequest,
  WithdrawalStatus,
} from '@/api/types'
import type { Currency } from '@/lib/money'

const usingTestFixtures = import.meta.env.MODE === 'test' && testFixturesEnabled

export type HistoryKind = 'all' | 'deposit' | 'withdrawal' | 'rounds' | 'adjustment'

export type HistoryFilter = {
  kind: HistoryKind
  days: 7 | 30 | 90
  page: number
  // Narrows the ledger to one wallet. Absent, every wallet's movements are
  // listed and each row carries its own currency.
  currency?: Currency
}

export type RoundFilter = Pick<HistoryFilter, 'page' | 'currency'> & {
  days?: HistoryFilter['days']
  game_id?: string
}

export type SummaryFilter = Pick<HistoryFilter, 'days' | 'currency'>

function matchesKind(kind: HistoryKind, transaction: Transaction): boolean {
  if (kind === 'all') return true
  if (kind === 'rounds') return transaction.kind === 'wager' || transaction.kind === 'win'
  return transaction.kind === kind
}

export const HISTORY_PAGE_SIZE = 20

export async function fetchCurrencies(): Promise<CurrencyMetadata[]> {
  if (usingTestFixtures) {
    const { currencies } = await import('@/mocks/wallet')
    return mockRequest(() => currencies.map((entry) => ({ ...entry })))
  }
  return api.get<CurrencyMetadata[]>('/currencies')
}

export async function fetchWallets(): Promise<Wallet[]> {
  if (usingTestFixtures) {
    const { wallets } = await import('@/mocks/wallet')
    return mockRequest(() => wallets.map((entry) => ({ ...entry })))
  }
  return api.get<Wallet[]>('/wallets')
}

export async function fetchWallet(currency: Currency): Promise<Wallet> {
  if (usingTestFixtures) {
    const { wallets } = await import('@/mocks/wallet')
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
  if (usingTestFixtures) {
    const { paymentMethods } = await import('@/mocks/wallet')
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

export async function fetchDeposits(status?: DepositStatus): Promise<DepositRequest[]> {
  if (usingTestFixtures) {
    const { depositRequests } = await import('@/mocks/wallet')
    return mockRequest(() =>
      depositRequests
        .filter((request) => !status || request.status === status)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .map((request) => ({ ...request })),
    )
  }
  const params = new URLSearchParams({ page: '1', size: '20' })
  if (status) params.set('status', status)
  const page = await api.get<Page<DepositRequest>>(`/deposits?${params.toString()}`)
  return page.rows
}

export async function fetchDeposit(id: string): Promise<DepositRequest | null> {
  if (usingTestFixtures) {
    const { depositRequests } = await import('@/mocks/wallet')
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
  if (usingTestFixtures) {
    const { depositRequests, paymentMethods, transactions } = await import('@/mocks/wallet')
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

export type WithdrawalLimits = {
  currency: Currency
  min_minor: number
  max_minor: number
}

export async function fetchWithdrawalLimits(currency: Currency): Promise<WithdrawalLimits> {
  const metadata = (await fetchCurrencies()).find((candidate) => candidate.code === currency)
  if (!metadata) {
    throw new Error(`Currency ${currency} is not enabled for withdrawals`)
  }
  return {
    currency: metadata.code,
    min_minor: metadata.withdrawal_min_minor,
    max_minor: metadata.withdrawal_max_minor,
  }
}

export async function fetchWithdrawals(status?: WithdrawalStatus): Promise<WithdrawalRequest[]> {
  if (usingTestFixtures) {
    const { withdrawalRequests } = await import('@/mocks/wallet')
    return mockRequest(() =>
      withdrawalRequests
        .filter((request) => !status || request.status === status)
        .map((request) => ({ ...request })),
    )
  }
  const params = new URLSearchParams({ page: '1', size: '20' })
  if (status) params.set('status', status)
  const page = await api.get<Page<WithdrawalRequest>>(`/withdrawals?${params.toString()}`)
  return page.rows
}

export async function fetchWithdrawal(id: string): Promise<WithdrawalRequest | null> {
  if (usingTestFixtures) {
    const { withdrawalRequests } = await import('@/mocks/wallet')
    return mockRequest(() => {
      const found = withdrawalRequests.find((request) => request.id === id)
      return found ? { ...found } : null
    })
  }
  try {
    return await api.get<WithdrawalRequest>(`/withdrawals/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export type NewWithdrawal = {
  method_id: string
  currency: Currency
  amount_minor: number
  account_name: string
  account_number: string
  idempotency_key: string
}

export async function submitWithdrawal(input: NewWithdrawal): Promise<WithdrawalRequest> {
  if (usingTestFixtures) {
    const { paymentMethods, withdrawalRequests } = await import('@/mocks/wallet')
    return mockRequest(() => {
      const method = paymentMethods.find((candidate) => candidate.id === input.method_id)
      const created: WithdrawalRequest = {
        id: `wd-${input.idempotency_key}`,
        method_id: input.method_id,
        method_name: method?.name ?? 'Method A',
        amount_minor: input.amount_minor,
        currency: input.currency,
        account_name: input.account_name,
        account_number: input.account_number,
        status: 'pending',
        payout_reference: null,
        reason: null,
        created_at: new Date().toISOString(),
        reviewed_at: null,
        cancelled_at: null,
      }
      withdrawalRequests.unshift(created)
      return { ...created }
    }, 600)
  }
  const { idempotency_key: idempotencyKey, ...body } = input
  return api.post<WithdrawalRequest>('/withdrawals', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export async function cancelWithdrawal(id: string): Promise<WithdrawalRequest> {
  if (usingTestFixtures) {
    const { withdrawalRequests } = await import('@/mocks/wallet')
    return mockRequest(() => {
      const found = withdrawalRequests.find((request) => request.id === id)
      if (!found) throw new ApiError(404, 'Withdrawal request not found')
      found.status = 'cancelled'
      found.cancelled_at = new Date().toISOString()
      return { ...found }
    })
  }
  return api.post<WithdrawalRequest>(`/withdrawals/${id}/cancel`)
}

export async function fetchTransactions(filter: HistoryFilter): Promise<Page<Transaction>> {
  if (usingTestFixtures) {
    const { transactions } = await import('@/mocks/wallet')
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

// One entry per wallet the player holds; the server never adds currencies
// together and neither does anything here.
export async function fetchWalletSummary(filter: SummaryFilter): Promise<WalletSummary[]> {
  if (usingTestFixtures) {
    const { walletSummary } = await import('@/mocks/wallet')
    return mockRequest(() =>
      walletSummary.filter((entry) => !filter.currency || entry.currency === filter.currency),
    )
  }

  const params = new URLSearchParams({
    from: new Date(Date.now() - filter.days * 86_400_000).toISOString(),
  })
  if (filter.currency) params.set('currency', filter.currency)

  return api.get<WalletSummary[]>(`/transactions/summary?${params.toString()}`)
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

export async function fetchRounds(filter: RoundFilter): Promise<Page<Round>> {
  if (usingTestFixtures) {
    const { rounds } = await import('@/mocks/wallet')
    return mockRequest(() => {
      const cutoff = filter.days ? Date.now() - filter.days * 86_400_000 : null
      const matched = rounds.filter(
        (round) =>
          (cutoff === null || Date.parse(round.started_at) >= cutoff) &&
          (!filter.currency || round.currency === filter.currency) &&
          (!filter.game_id || round.game_id === filter.game_id),
      )
      return paginate(matched, filter.page, HISTORY_PAGE_SIZE)
    })
  }

  const params = new URLSearchParams({
    page: String(filter.page),
    size: String(HISTORY_PAGE_SIZE),
  })
  if (filter.days) params.set('from', new Date(Date.now() - filter.days * 86_400_000).toISOString())
  if (filter.currency) params.set('currency', filter.currency)
  if (filter.game_id) params.set('game_id', filter.game_id)
  return api.get<Page<Round>>(`/rounds?${params.toString()}`)
}

const RECENT_ROUNDS = 10

export async function fetchRecentRounds(gameId: string, currency: Currency): Promise<Round[]> {
  const page = await fetchRounds({ page: 1, game_id: gameId, currency })
  return page.rows.slice(0, RECENT_ROUNDS)
}

const NOTIFICATION_PAGE_SIZE = 20

export async function fetchNotifications(): Promise<Notification[]> {
  if (usingTestFixtures) {
    const { notifications } = await import('@/mocks/wallet')
    return mockRequest(() => [...notifications])
  }
  const page = await api.get<Page<Notification>>(`/notifications?page=1&size=${NOTIFICATION_PAGE_SIZE}`)
  return page.rows
}

export async function markNotificationsRead(): Promise<void> {
  if (usingTestFixtures) {
    const { notifications } = await import('@/mocks/wallet')
    return mockRequest(() => {
      for (const notification of notifications) {
        notification.read = true
      }
    }, 120)
  }
  await api.post<void>('/notifications/read')
}
