import { api, ApiError } from '@/api/client'
import { mockRequest, paginate, type Page } from '@/api/mock'
import { usingMockApi } from '@/api/mode'
import type {
  AccountStatus,
  AdminDeposit,
  AdminGame,
  AdminUser,
  Adjustment,
  AuditEntry,
  ConsoleAlert,
  DashboardSummary,
  PaymentMethod,
  Round,
  RtpProfile,
  Transaction,
  Wallet,
} from '@/api/types'
import type { Currency } from '@/lib/money'
import {
  adjustmentReasons,
  adjustments,
  adminDeposits,
  adminGames,
  adminUsers,
  auditEntries,
  consoleAlerts,
  dashboardSummary,
  rtpProfiles,
  staffAccounts,
} from '@/mocks/admin'
import { paymentMethods, rounds, transactions } from '@/mocks/wallet'

export const ADMIN_PAGE_SIZE = 20
const useRealAdminApi = !usingMockApi && import.meta.env.MODE !== 'test'

export function adminDepositProofUrl(id: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'
  return `${base}/admin/deposits/${encodeURIComponent(id)}/proof`
}

export type UserFilter = {
  status: 'all' | AccountStatus
  search: string
  page: number
}

export async function fetchDashboard(): Promise<DashboardSummary> {
  if (useRealAdminApi) {
    return api.get<DashboardSummary>('/admin/dashboard?currency=PHP')
  }
  return mockRequest(() => ({ ...dashboardSummary, pending_deposits: pendingQueue().length }))
}

export async function fetchConsoleAlerts(): Promise<ConsoleAlert[]> {
  return mockRequest(() => [...consoleAlerts])
}

export async function fetchAuditEntries(
  page = 1,
  size = ADMIN_PAGE_SIZE,
): Promise<Page<AuditEntry>> {
  if (useRealAdminApi) {
    const response = await api.get<Page<BackendAuditEntry>>(
      `/admin/audit-logs?page=${page}&size=${size}`,
    )
    return {
      ...response,
      rows: response.rows.map((entry) => ({
        id: entry.id,
        created_at: entry.created_at,
        operator: entry.actor_display_name,
        action: entry.action,
        entity: `${entry.entity_type}:${entry.entity_id}`,
        detail: entry.detail,
      })),
    }
  }
  return mockRequest(() => paginate(auditEntries, page, size))
}

type BackendAuditEntry = {
  id: string
  actor_display_name: string
  action: string
  entity_type: string
  entity_id: string
  detail: string
  created_at: string
}

function pendingQueue(): AdminDeposit[] {
  return adminDeposits
    .filter((deposit) => deposit.status === 'pending')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

export async function fetchDepositQueue(): Promise<AdminDeposit[]> {
  if (useRealAdminApi) {
    const page = await api.get<Page<BackendAdminDeposit>>('/admin/deposits?page=1&size=100')
    return page.rows.map(toAdminDeposit)
  }
  return mockRequest(pendingQueue)
}

export type DepositReview = {
  id: string
  action: 'approve' | 'reject'
  amount_minor?: number | undefined
  reason?: string | undefined
}

export async function reviewDeposit(review: DepositReview): Promise<void> {
  if (useRealAdminApi) {
    await api.post('/admin/deposits/' + review.id + '/review', {
      action: review.action,
      amount_minor: review.amount_minor,
      reason: review.reason,
    })
    return
  }
  return mockRequest(() => {
    const deposit = adminDeposits.find((candidate) => candidate.id === review.id)
    if (!deposit) {
      throw new Error(`deposit ${review.id} not found`)
    }

    deposit.status = review.action === 'approve' ? 'approved' : 'rejected'
    deposit.reviewed_at = new Date().toISOString()
    deposit.reason = review.reason ?? null
    if (review.action === 'approve' && review.amount_minor !== undefined) {
      deposit.amount_minor = review.amount_minor
    }

    const user = adminUsers.find((candidate) => candidate.id === deposit.user_id)
    if (user && review.action === 'approve') {
      user.balance_minor += deposit.amount_minor
      user.deposits_approved += 1
    }

    auditEntries.unshift({
      id: `au-${Date.now()}`,
      created_at: new Date().toISOString(),
      operator: 'R. Cruz',
      action: review.action === 'approve' ? 'deposit.approve' : 'deposit.reject',
      entity: deposit.reference,
      detail:
        review.action === 'approve'
          ? `Approved ${deposit.reference} for ${deposit.username}`
          : `Rejected ${deposit.reference} · reason: ${review.reason ?? 'not given'}`,
    })

  }, 500)
}

type BackendAdminDeposit = {
  id: string
  user_id: string
  user_email: string
  display_name: string
  method_id: string
  method_name: string
  amount_minor: number
  currency: Currency
  reference: string
  status: AdminDeposit['status']
  created_at: string
  reviewed_at: string | null
  reason: string | null
}

function toAdminDeposit(row: BackendAdminDeposit): AdminDeposit {
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.display_name || row.user_email,
    reference: row.reference,
    method_id: row.method_id,
    method_name: row.method_name,
    amount_minor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
    reason: row.reason,
  }
}

export async function fetchUsers(filter: UserFilter): Promise<Page<AdminUser>> {
  if (useRealAdminApi) {
    const params = new URLSearchParams({
      page: String(filter.page),
      size: String(ADMIN_PAGE_SIZE),
    })
    if (filter.status !== 'all') params.set('status', filter.status)
    if (filter.search.trim() !== '') params.set('search', filter.search.trim())
    return api.get<Page<AdminUser>>(`/admin/users?${params.toString()}`)
  }
  return mockRequest(() => {
    const search = filter.search.trim().toLowerCase()
    const matched = adminUsers.filter((user) => {
      const matchesStatus = filter.status === 'all' || user.status === filter.status
      const matchesSearch =
        search === '' ||
        user.display_name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search) ||
        user.account_ref.toLowerCase().includes(search)
      return matchesStatus && matchesSearch
    })
    return paginate(matched, filter.page, ADMIN_PAGE_SIZE)
  })
}

export async function fetchUserCounts() {
  if (useRealAdminApi) {
    const fetchTotal = async (status?: AccountStatus) => {
      const suffix = status ? `&status=${status}` : ''
      const page = await api.get<Page<AdminUser>>(`/admin/users?page=1&size=1${suffix}`)
      return page.total
    }
    const [all, active, suspended] = await Promise.all([
      fetchTotal(),
      fetchTotal('active'),
      fetchTotal('suspended'),
    ])
    return { all, active, suspended }
  }
  return mockRequest(() => ({
    all: adminUsers.length,
    active: adminUsers.filter((user) => user.status === 'active').length,
    suspended: adminUsers.filter((user) => user.status === 'suspended').length,
  }))
}

export async function fetchUser(id: string): Promise<AdminUser | null> {
  if (useRealAdminApi) {
    try {
      return await api.get<AdminUser>(`/admin/users/${id}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  }
  return mockRequest(() => adminUsers.find((user) => user.id === id) ?? null)
}

export async function fetchUserWallets(id: string): Promise<Wallet[]> {
  if (useRealAdminApi) {
    return api.get<Wallet[]>(`/admin/users/${id}/wallets`)
  }
  return mockRequest(() => {
    const account = adminUsers.find((user) => user.id === id)
    if (!account) return []
    return [
      { currency: account.currency, balance_minor: account.balance_minor },
      { currency: account.currency === 'PHP' ? 'USD' : 'PHP', balance_minor: 0 },
    ]
  })
}

export async function fetchUserRounds(): Promise<Round[]> {
  return mockRequest(() => rounds.slice(0, 12))
}

export async function fetchUserDeposits(userId: string): Promise<AdminDeposit[]> {
  if (useRealAdminApi) {
    const page = await api.get<Page<BackendAdminDeposit>>(
      `/admin/deposits?page=1&size=100&status=all&user_id=${encodeURIComponent(userId)}`,
    )
    return page.rows.map(toAdminDeposit)
  }
  return mockRequest(() => adminDeposits.filter((deposit) => deposit.user_id === userId))
}

export async function fetchUserAdjustments(userId: string): Promise<Adjustment[]> {
  if (useRealAdminApi) {
    const page = await api.get<BackendAdminTransactionPage>(
      `/admin/transactions?page=1&size=100&type=adjustment&user_id=${encodeURIComponent(userId)}`,
    )
    return page.rows.map((entry) => ({
      id: entry.id,
      user_id: entry.user_id,
      amount_minor: entry.amount_minor,
      currency: entry.currency,
      reason: entry.reason,
      operator: entry.actor_display_name || 'System',
      created_at: entry.created_at,
    }))
  }
  return mockRequest(() => adjustments.filter((entry) => entry.user_id === userId))
}

export type WalletAdjustment = {
  user_id: string
  currency: Currency
  direction: 'credit' | 'debit'
  amount_minor: number
  reason: string
}

export type AdminAdjustment = {
  id: string
  kind: 'adjustment'
  amount_minor: number
  currency: Currency
  balance_before: number
  balance_after: number
  reason: string
  created_at: string
}

export async function adjustWallet(input: WalletAdjustment): Promise<AdminAdjustment | AdminUser> {
  if (useRealAdminApi) {
    return api.post<AdminAdjustment>(`/admin/users/${input.user_id}/wallet-adjustments`, {
      direction: input.direction,
      currency: input.currency,
      amount_minor: input.amount_minor,
      reason: input.reason,
    })
  }
  return mockRequest(() => {
    const user = adminUsers.find((candidate) => candidate.id === input.user_id)
    if (!user) {
      throw new Error(`user ${input.user_id} not found`)
    }

    const signed = input.direction === 'credit' ? input.amount_minor : -input.amount_minor
    if (user.balance_minor + signed < 0) {
      throw new Error('A debit cannot take a wallet below zero')
    }

    user.balance_minor += signed

    adjustments.unshift({
      id: `adj-${Date.now()}`,
      user_id: user.id,
      amount_minor: signed,
      currency: user.currency,
      reason: input.reason,
      operator: 'R. Cruz',
      created_at: new Date().toISOString(),
    })

    auditEntries.unshift({
      id: `au-${Date.now()}`,
      created_at: new Date().toISOString(),
      operator: 'R. Cruz',
      action: input.direction === 'credit' ? 'wallet.credit' : 'wallet.debit',
      entity: user.account_ref,
      detail: `${input.direction === 'credit' ? 'Credited' : 'Debited'} ${user.display_name} · ${input.reason}`,
    })

    return user
  }, 450)
}

export type AdminTransaction = Transaction & {
  user_id: string
  wallet_id: string
}

export type AdminTransactionFilter = {
  kind: 'all' | 'deposit' | 'rounds' | 'adjustment'
  days: 7 | 30 | 90
  page: number
}

type BackendAdminTransaction = {
  id: string
  user_id: string
  wallet_id: string
  kind: Transaction['kind']
  amount_minor: number
  currency: Currency
  reason: string
  actor_user_id?: string
  actor_display_name?: string
  created_at: string
}

type BackendAdminTransactionPage = {
  rows: BackendAdminTransaction[]
  total: number
  page: number
  size: number
  pages: number
}

export async function fetchAdminTransactions(filter: AdminTransactionFilter): Promise<Page<AdminTransaction>> {
  if (useRealAdminApi) {
    const cutoff = new Date(Date.now() - filter.days * 86_400_000).toISOString()
    const type = filter.kind === 'all' || filter.kind === 'rounds' ? '' : `&type=${filter.kind}`
    const response = await api.get<BackendAdminTransactionPage>(
      `/admin/transactions?page=1&size=100&from=${encodeURIComponent(cutoff)}${type}`,
    )
    const rows = response.rows
      .map(toAdminTransaction)
      .filter((transaction) => filter.kind !== 'rounds' || transaction.kind === 'wager' || transaction.kind === 'win')
    return paginate(rows, filter.page, ADMIN_PAGE_SIZE)
  }

  return mockRequest(() => {
    const cutoff = Date.now() - filter.days * 86_400_000
    const rows = transactions
      .filter((transaction) => Date.parse(transaction.created_at) >= cutoff)
      .filter((transaction) => {
        if (filter.kind === 'all') return true
        if (filter.kind === 'rounds') return transaction.kind === 'wager' || transaction.kind === 'win'
        return transaction.kind === filter.kind
      })
      .map((transaction) => ({ ...transaction, user_id: '', wallet_id: '' }))
    return paginate(rows, filter.page, ADMIN_PAGE_SIZE)
  })
}

function toAdminTransaction(row: BackendAdminTransaction): AdminTransaction {
  return {
    id: row.id,
    user_id: row.user_id,
    wallet_id: row.wallet_id,
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

export async function setUserStatus(id: string, status: AccountStatus): Promise<AdminUser> {
  if (useRealAdminApi) {
    return api.patch<AdminUser>(`/admin/users/${id}/status`, { status })
  }
  return mockRequest(() => {
    const user = adminUsers.find((candidate) => candidate.id === id)
    if (!user) {
      throw new Error(`user ${id} not found`)
    }
    user.status = status

    auditEntries.unshift({
      id: `au-${Date.now()}`,
      created_at: new Date().toISOString(),
      operator: 'R. Cruz',
      action: status === 'suspended' ? 'user.suspend' : 'user.reinstate',
      entity: user.account_ref,
      detail: `${status === 'suspended' ? 'Suspended' : 'Reinstated'} ${user.display_name}`,
    })

    return user
  }, 400)
}

export async function fetchAdminGames(): Promise<AdminGame[]> {
  return mockRequest(() => [...adminGames])
}

export async function fetchAdminGame(id: string): Promise<AdminGame | null> {
  return mockRequest(() => adminGames.find((game) => game.id === id) ?? null)
}

export async function fetchAdminRounds(): Promise<Round[]> {
  return mockRequest(() => rounds.slice(0, 40))
}

export async function fetchRtpProfiles(): Promise<RtpProfile[]> {
  return mockRequest(() => [...rtpProfiles])
}

export async function fetchStaff() {
  return mockRequest(() => [...staffAccounts])
}

export async function fetchAdminPaymentMethods(): Promise<PaymentMethod[]> {
  return mockRequest(() => [...paymentMethods])
}

export function reasonOptions(): readonly string[] {
  return adjustmentReasons
}
