import { mockRequest, paginate, type Page } from '@/api/mock'
import type {
  AccountStatus,
  AdminDeposit,
  AdminGame,
  AdminUserRecord,
  Adjustment,
  AuditEntry,
  ConsoleAlert,
  DashboardSummary,
  PaymentMethod,
  Round,
  RtpProfile,
} from '@/api/types'
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
import { paymentMethods, rounds } from '@/mocks/wallet'

export const ADMIN_PAGE_SIZE = 20

export type UserFilter = {
  status: 'all' | AccountStatus
  search: string
  page: number
}

export async function fetchDashboard(): Promise<DashboardSummary> {
  return mockRequest(() => ({ ...dashboardSummary, pending_deposits: pendingQueue().length }))
}

export async function fetchConsoleAlerts(): Promise<ConsoleAlert[]> {
  return mockRequest(() => [...consoleAlerts])
}

export async function fetchAuditEntries(limit?: number): Promise<AuditEntry[]> {
  return mockRequest(() => (limit ? auditEntries.slice(0, limit) : [...auditEntries]))
}

function pendingQueue(): AdminDeposit[] {
  return adminDeposits
    .filter((deposit) => deposit.status === 'pending')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

export async function fetchDepositQueue(): Promise<AdminDeposit[]> {
  return mockRequest(pendingQueue)
}

export async function fetchAllDeposits(): Promise<AdminDeposit[]> {
  return mockRequest(() =>
    [...adminDeposits].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
  )
}

export type DepositReview = {
  id: string
  action: 'approve' | 'reject'
  amount_minor?: number | undefined
  reason?: string | undefined
}

export async function reviewDeposit(review: DepositReview): Promise<AdminDeposit> {
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

    return deposit
  }, 500)
}

export async function fetchUsers(filter: UserFilter): Promise<Page<AdminUserRecord>> {
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
  return mockRequest(() => ({
    all: adminUsers.length,
    active: adminUsers.filter((user) => user.status === 'active').length,
    suspended: adminUsers.filter((user) => user.status === 'suspended').length,
  }))
}

export async function fetchUser(id: string): Promise<AdminUserRecord | null> {
  return mockRequest(() => adminUsers.find((user) => user.id === id) ?? null)
}

export async function fetchUserRounds(): Promise<Round[]> {
  return mockRequest(() => rounds.slice(0, 12))
}

export async function fetchUserDeposits(userId: string): Promise<AdminDeposit[]> {
  return mockRequest(() => adminDeposits.filter((deposit) => deposit.user_id === userId))
}

export async function fetchUserAdjustments(userId: string): Promise<Adjustment[]> {
  return mockRequest(() => adjustments.filter((entry) => entry.user_id === userId))
}

export type WalletAdjustment = {
  user_id: string
  direction: 'credit' | 'debit'
  amount_minor: number
  reason: string
}

export async function adjustWallet(input: WalletAdjustment): Promise<AdminUserRecord> {
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

export async function setUserStatus(id: string, status: AccountStatus): Promise<AdminUserRecord> {
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
