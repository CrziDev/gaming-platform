import { api, ApiError } from '@/api/client'
import { mockRequest, paginate, type Page } from '@/api/mock'
import { usingFixtures } from '@/api/mode'
import type {
  AccountStatus,
  AdminDeposit,
  AdminGame,
  AdminUser,
  Adjustment,
  AuditEntry,
  Category,
  ConsoleAlert,
  DashboardSummary,
  GameStatus,
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
  adminUserWallets,
  adminUsers,
  auditEntries,
  consoleAlerts,
  dashboardSummary,
  rtpProfiles,
  staffAccounts,
} from '@/mocks/admin'
import { categories, games } from '@/mocks/games'
import { paymentMethods, rounds, transactions } from '@/mocks/wallet'

export const ADMIN_PAGE_SIZE = 20

export function adminDepositProofUrl(id: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'
  return `${base}/admin/deposits/${encodeURIComponent(id)}/proof`
}

export type UserFilter = {
  status: 'all' | AccountStatus
  search: string
  page: number
}

export async function fetchDashboard(currency: Currency): Promise<DashboardSummary> {
  if (usingFixtures) {
    return mockRequest(() => ({ ...dashboardSummary, currency, pending_deposits: pendingQueue().length }))
  }
  return api.get<DashboardSummary>(`/admin/dashboard?currency=${encodeURIComponent(currency)}`)
}

// Alerts, rounds, staff, and payment-method administration have no service
// yet. Outside the demo and tests they read as empty so the console shows
// nothing an operator could act on that the platform cannot do.
export async function fetchConsoleAlerts(): Promise<ConsoleAlert[]> {
  if (!usingFixtures) return []
  return mockRequest(() => [...consoleAlerts])
}

export async function fetchAuditEntries(
  page = 1,
  size = ADMIN_PAGE_SIZE,
): Promise<Page<AuditEntry>> {
  if (usingFixtures) {
    return mockRequest(() => paginate(auditEntries, page, size))
  }
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

export async function fetchDepositQueue(page = 1, size = ADMIN_PAGE_SIZE): Promise<Page<AdminDeposit>> {
  if (usingFixtures) {
    return mockRequest(() => paginate(pendingQueue(), page, size))
  }
  const response = await api.get<Page<BackendAdminDeposit>>(`/admin/deposits?page=${page}&size=${size}`)
  return { ...response, rows: response.rows.map(toAdminDeposit) }
}

export type DepositReview = {
  id: string
  action: 'approve' | 'reject'
  amount_minor?: number | undefined
  reason?: string | undefined
}

export async function reviewDeposit(review: DepositReview): Promise<void> {
  if (usingFixtures) {
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

      const wallet = adminUserWallets[deposit.user_id]?.find(
        (candidate) => candidate.currency === deposit.currency,
      )
      if (wallet && review.action === 'approve') {
        wallet.balance_minor += deposit.amount_minor
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

  await api.post('/admin/deposits/' + review.id + '/review', {
    action: review.action,
    amount_minor: review.amount_minor,
    reason: review.reason,
  })
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
  if (usingFixtures) {
    return mockRequest(() => {
      const search = filter.search.trim().toLowerCase()
      const matched = adminUsers.filter((user) => {
        const matchesStatus = filter.status === 'all' || user.status === filter.status
        const matchesSearch =
          search === '' ||
          user.display_name.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search) ||
          user.id.toLowerCase().includes(search)
        return matchesStatus && matchesSearch
      })
      return paginate(matched, filter.page, ADMIN_PAGE_SIZE)
    })
  }

  const params = new URLSearchParams({
    page: String(filter.page),
    size: String(ADMIN_PAGE_SIZE),
  })
  if (filter.status !== 'all') params.set('status', filter.status)
  if (filter.search.trim() !== '') params.set('search', filter.search.trim())
  return api.get<Page<AdminUser>>(`/admin/users?${params.toString()}`)
}

export async function fetchUserCounts() {
  if (usingFixtures) {
    return mockRequest(() => ({
      all: adminUsers.length,
      active: adminUsers.filter((user) => user.status === 'active').length,
      suspended: adminUsers.filter((user) => user.status === 'suspended').length,
    }))
  }

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

export async function fetchUser(id: string): Promise<AdminUser | null> {
  if (usingFixtures) {
    return mockRequest(() => adminUsers.find((user) => user.id === id) ?? null)
  }
  try {
    return await api.get<AdminUser>(`/admin/users/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function fetchUserWallets(id: string): Promise<Wallet[]> {
  if (usingFixtures) {
    return mockRequest(() => (adminUserWallets[id] ?? []).map((wallet) => ({ ...wallet })))
  }
  return api.get<Wallet[]>(`/admin/users/${id}/wallets`)
}

export async function fetchUserRounds(): Promise<Round[]> {
  if (!usingFixtures) return []
  return mockRequest(() => rounds.slice(0, 12))
}

export async function fetchUserDeposits(userId: string, page = 1): Promise<Page<AdminDeposit>> {
  if (usingFixtures) {
    return mockRequest(() =>
      paginate(
        adminDeposits.filter((deposit) => deposit.user_id === userId),
        page,
        ADMIN_PAGE_SIZE,
      ),
    )
  }
  const response = await api.get<Page<BackendAdminDeposit>>(
    `/admin/deposits?page=${page}&size=${ADMIN_PAGE_SIZE}&status=all&user_id=${encodeURIComponent(userId)}`,
  )
  return { ...response, rows: response.rows.map(toAdminDeposit) }
}

export async function fetchUserAdjustments(userId: string, page = 1): Promise<Page<Adjustment>> {
  if (usingFixtures) {
    return mockRequest(() =>
      paginate(
        adjustments.filter((entry) => entry.user_id === userId),
        page,
        ADMIN_PAGE_SIZE,
      ),
    )
  }
  const response = await api.get<Page<BackendAdminTransaction>>(
    `/admin/transactions?page=${page}&size=${ADMIN_PAGE_SIZE}&type=adjustment&user_id=${encodeURIComponent(userId)}`,
  )
  return {
    ...response,
    rows: response.rows.map((entry) => ({
      id: entry.id,
      user_id: entry.user_id,
      amount_minor: entry.amount_minor,
      currency: entry.currency,
      reason: entry.reason,
      operator: entry.actor_display_name || 'System',
      created_at: entry.created_at,
    })),
  }
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

export async function adjustWallet(input: WalletAdjustment): Promise<AdminAdjustment> {
  if (usingFixtures) {
    return mockRequest(() => {
      const user = adminUsers.find((candidate) => candidate.id === input.user_id)
      if (!user) {
        throw new Error(`user ${input.user_id} not found`)
      }
      const wallet = adminUserWallets[user.id]?.find(
        (candidate) => candidate.currency === input.currency,
      )
      if (!wallet) {
        throw new Error(`${input.currency} wallet for user ${input.user_id} not found`)
      }

      const signed = input.direction === 'credit' ? input.amount_minor : -input.amount_minor
      if (wallet.balance_minor + signed < 0) {
        throw new ApiError(409, 'The wallet balance is too low', 'INSUFFICIENT_BALANCE')
      }

      const balanceBefore = wallet.balance_minor
      wallet.balance_minor += signed

      const adjustment: Adjustment = {
        id: `adj-${Date.now()}`,
        user_id: user.id,
        amount_minor: signed,
        currency: input.currency,
        reason: input.reason,
        operator: 'R. Cruz',
        created_at: new Date().toISOString(),
      }
      adjustments.unshift(adjustment)

      auditEntries.unshift({
        id: `au-${Date.now()}`,
        created_at: new Date().toISOString(),
        operator: 'R. Cruz',
        action: input.direction === 'credit' ? 'wallet.credit' : 'wallet.debit',
        entity: user.id.slice(0, 8).toUpperCase(),
        detail: `${input.direction === 'credit' ? 'Credited' : 'Debited'} ${user.display_name} · ${input.reason}`,
      })

      return {
        id: adjustment.id,
        kind: 'adjustment',
        amount_minor: adjustment.amount_minor,
        currency: adjustment.currency,
        balance_before: balanceBefore,
        balance_after: wallet.balance_minor,
        reason: adjustment.reason,
        created_at: adjustment.created_at,
      }
    }, 450)
  }

  return api.post<AdminAdjustment>(`/admin/users/${input.user_id}/wallet-adjustments`, {
    direction: input.direction,
    currency: input.currency,
    amount_minor: input.amount_minor,
    reason: input.reason,
  })
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

export async function fetchAdminTransactions(filter: AdminTransactionFilter): Promise<Page<AdminTransaction>> {
  if (usingFixtures) {
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

  // Rounds are two ledger kinds the server cannot select together, and none
  // exist until the round APIs do; the tab is honest about that.
  if (filter.kind === 'rounds') {
    return paginate<AdminTransaction>([], 1, ADMIN_PAGE_SIZE)
  }

  const params = new URLSearchParams({
    page: String(filter.page),
    size: String(ADMIN_PAGE_SIZE),
    from: new Date(Date.now() - filter.days * 86_400_000).toISOString(),
  })
  if (filter.kind !== 'all') params.set('type', filter.kind)

  const response = await api.get<Page<BackendAdminTransaction>>(`/admin/transactions?${params.toString()}`)
  return { ...response, rows: response.rows.map(toAdminTransaction) }
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
  if (usingFixtures) {
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
        entity: user.id.slice(0, 8).toUpperCase(),
        detail: `${status === 'suspended' ? 'Suspended' : 'Reinstated'} ${user.display_name}`,
      })

      return user
    }, 400)
  }
  return api.patch<AdminUser>(`/admin/users/${id}/status`, { status })
}

// The admin catalogue is far below the contract's page cap of 100; the screens
// need paging, not a larger number here, if it ever grows past that.
const ADMIN_CATALOGUE_SIZE = 100

export async function fetchAdminGames(): Promise<AdminGame[]> {
  if (usingFixtures) {
    return mockRequest(() => [...adminGames])
  }
  const page = await api.get<Page<AdminGame>>(`/admin/games?page=1&size=${ADMIN_CATALOGUE_SIZE}`)
  return page.rows
}

export async function fetchAdminGame(id: string): Promise<AdminGame | null> {
  if (usingFixtures) {
    return mockRequest(() => adminGames.find((game) => game.id === id) ?? null)
  }
  try {
    return await api.get<AdminGame>(`/admin/games/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

// Every category, including ones with no active game: an operator files a
// game under a category before it has anything to show a player.
export async function fetchAllCategories(): Promise<Category[]> {
  if (usingFixtures) {
    return mockRequest(() => [...categories])
  }
  return api.get<Category[]>('/categories')
}

export type GameInput = {
  slug: string
  name: string
  description: string
  category_slug: string
  provider: string
  status: GameStatus
  currency: Currency
  min_wager_minor: number
  max_wager_minor: number
  wager_step_minor: number
}

export type GamePatch = Partial<Omit<GameInput, 'slug'>>

export async function createGame(input: GameInput): Promise<AdminGame> {
  if (usingFixtures) {
    return mockRequest(() => {
      if (adminGames.some((game) => game.slug === input.slug)) {
        throw new ApiError(409, 'That slug is already taken', null, { slug: 'Already taken' })
      }
      const category = categories.find((entry) => entry.slug === input.category_slug)
      const now = new Date().toISOString()
      const created: AdminGame = {
        id: `gm-${Date.now()}`,
        ...input,
        category_name: category?.name ?? input.category_slug,
        thumbnail_url: null,
        flags: ['new'],
        integration: 'unreviewed',
        active_rtp_basis_points: null,
        rounds_30d: 0,
        created_at: now,
        updated_at: now,
      }
      adminGames.unshift(created)
      if (created.status === 'active') games.unshift(created)
      return created
    }, 400)
  }
  return api.post<AdminGame>('/admin/games', input)
}

export async function updateGame(id: string, patch: GamePatch): Promise<AdminGame> {
  if (usingFixtures) {
    return mockRequest(() => {
      const game = adminGames.find((candidate) => candidate.id === id)
      if (!game) {
        throw new ApiError(404, 'Game not found')
      }
      Object.assign(game, patch, { updated_at: new Date().toISOString() })
      if (patch.category_slug) {
        game.category_name =
          categories.find((entry) => entry.slug === patch.category_slug)?.name ?? patch.category_slug
      }
      const listed = games.find((candidate) => candidate.id === id)
      if (listed) Object.assign(listed, patch)
      return { ...game }
    }, 400)
  }
  return api.patch<AdminGame>(`/admin/games/${encodeURIComponent(id)}`, patch)
}

export async function fetchAdminRounds(): Promise<Round[]> {
  if (!usingFixtures) return []
  return mockRequest(() => rounds.slice(0, 40))
}

export async function fetchRtpProfiles(): Promise<RtpProfile[]> {
  if (usingFixtures) {
    return mockRequest(() => [...rtpProfiles])
  }
  const page = await api.get<Page<RtpProfile>>(`/admin/rtp-profiles?page=1&size=${ADMIN_CATALOGUE_SIZE}`)
  return page.rows
}

export async function fetchGameRtpProfiles(gameId: string): Promise<RtpProfile[]> {
  if (usingFixtures) {
    return mockRequest(() => rtpProfiles.filter((profile) => profile.game_id === gameId))
  }
  return api.get<RtpProfile[]>(`/admin/games/${encodeURIComponent(gameId)}/rtp-profiles`)
}

export type RtpDraftInput = {
  name: string
  version: number
  target_basis_points: number
  engine_config_ref: string
}

export async function createRtpProfile(gameId: string, input: RtpDraftInput): Promise<RtpProfile> {
  if (usingFixtures) {
    return mockRequest(() => {
      const game = adminGames.find((candidate) => candidate.id === gameId)
      if (!game) {
        throw new ApiError(404, 'Game not found')
      }
      const taken = rtpProfiles.some(
        (p) => p.game_id === gameId && p.name === input.name && p.version === input.version,
      )
      if (taken) {
        throw new ApiError(409, 'That name and version already exist for this game', null, {
          version: 'Already used with this name',
        })
      }
      const now = new Date().toISOString()
      const created: RtpProfile = {
        id: `rtp-${Date.now()}`,
        game_id: game.id,
        game_slug: game.slug,
        game_name: game.name,
        ...input,
        status: 'draft',
        theoretical_basis_points: null,
        observed_basis_points: null,
        verified_at: null,
        effective_from: null,
        effective_until: null,
        created_by: '',
        created_by_display_name: 'R. Cruz',
        created_at: now,
        updated_at: now,
      }
      rtpProfiles.unshift(created)
      return created
    }, 400)
  }
  return api.post<RtpProfile>(`/admin/games/${encodeURIComponent(gameId)}/rtp-profiles`, input)
}

export async function updateRtpProfile(id: string, patch: Partial<RtpDraftInput>): Promise<RtpProfile> {
  if (usingFixtures) {
    return mockRequest(() => {
      const profile = rtpProfiles.find((candidate) => candidate.id === id)
      if (!profile) {
        throw new ApiError(404, 'Profile not found')
      }
      if (profile.status !== 'draft') {
        throw new ApiError(400, 'Only a draft profile can be edited; a verified profile changes by a new version')
      }
      Object.assign(profile, patch, { updated_at: new Date().toISOString() })
      return { ...profile }
    }, 400)
  }
  return api.patch<RtpProfile>(`/admin/rtp-profiles/${encodeURIComponent(id)}`, patch)
}

export type RtpSchedule = {
  effective_from?: string
  effective_until?: string
}

export async function activateRtpProfile(id: string, schedule: RtpSchedule): Promise<RtpProfile> {
  if (usingFixtures) {
    return mockRequest(() => {
      const profile = rtpProfiles.find((candidate) => candidate.id === id)
      if (!profile) {
        throw new ApiError(404, 'Profile not found')
      }
      if (profile.status !== 'verified' && profile.status !== 'active') {
        throw new ApiError(
          409,
          'Only a profile the engine has verified can be activated',
          'RTP_PROFILE_NOT_VERIFIED',
        )
      }
      for (const other of rtpProfiles) {
        if (other.game_id === profile.game_id && other.status === 'active' && other.id !== id) {
          other.status = 'verified'
          other.effective_from = null
          other.effective_until = null
        }
      }
      profile.status = 'active'
      profile.effective_from = schedule.effective_from ?? null
      profile.effective_until = schedule.effective_until ?? null
      const game = adminGames.find((candidate) => candidate.id === profile.game_id)
      if (game) game.active_rtp_basis_points = profile.target_basis_points
      return { ...profile }
    }, 400)
  }
  return api.post<RtpProfile>(`/admin/rtp-profiles/${encodeURIComponent(id)}/activate`, schedule)
}

export async function fetchStaff() {
  if (!usingFixtures) return [] as typeof staffAccounts
  return mockRequest(() => [...staffAccounts])
}

export async function fetchAdminPaymentMethods(): Promise<PaymentMethod[]> {
  if (!usingFixtures) return []
  return mockRequest(() => [...paymentMethods])
}

export function reasonOptions(): readonly string[] {
  return adjustmentReasons
}
