import { api, ApiError } from '@/api/client'
import { mockRequest, paginate, type Page } from '@/api/mock'
import { testFixturesEnabled } from '@/api/mode'
import type {
  AccountStatus,
  AdminDeposit,
  AdminGame,
  AdminPaymentMethod,
  AdminRtpConfiguration,
  AdminRound,
  AdminUser,
  Adjustment,
  AuditEntry,
  Category,
  DashboardSummary,
  GameStatus,
  Round,
  Transaction,
  Wallet,
} from '@/api/types'
import type { Currency } from '@/lib/money'

const usingTestFixtures = import.meta.env.MODE === 'test' && testFixturesEnabled
const adjustmentReasons = [
  'Goodwill — delayed deposit review',
  'Deposit credited manually',
  'Duplicate credit reversed',
  'Chargeback recovered',
  'Promotional credit',
] as const

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
  if (usingTestFixtures) {
    const { adminDeposits, dashboardSummary } = await import('@/mocks/admin')
    return mockRequest(() => ({
      ...dashboardSummary,
      currency,
      pending_deposits: pendingQueue(adminDeposits).length,
    }))
  }
  return api.get<DashboardSummary>(`/admin/dashboard?currency=${encodeURIComponent(currency)}`)
}

export async function fetchAuditEntries(
  page = 1,
  size = ADMIN_PAGE_SIZE,
): Promise<Page<AuditEntry>> {
  if (usingTestFixtures) {
    const { auditEntries } = await import('@/mocks/admin')
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

function pendingQueue(adminDeposits: AdminDeposit[]): AdminDeposit[] {
  return adminDeposits
    .filter((deposit) => deposit.status === 'pending')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

export async function fetchDepositQueue(page = 1, size = ADMIN_PAGE_SIZE): Promise<Page<AdminDeposit>> {
  if (usingTestFixtures) {
    const { adminDeposits } = await import('@/mocks/admin')
    return mockRequest(() => paginate(pendingQueue(adminDeposits), page, size))
  }
  const response = await api.get<Page<BackendAdminDeposit>>(`/admin/deposits?page=${page}&size=${size}`)
  return { ...response, rows: response.rows.map(toAdminDeposit) }
}

export type AdminDepositFilter = {
  page: number
  size?: number
  status?: 'all' | AdminDeposit['status']
  search?: string
  user_id?: string
}

export async function fetchAdminDeposits(filter: AdminDepositFilter): Promise<Page<AdminDeposit>> {
  if (usingTestFixtures) {
    const { adminDeposits } = await import('@/mocks/admin')
    return mockRequest(() => {
      const search = filter.search?.trim().toLowerCase() ?? ''
      const rows = adminDeposits.filter((deposit) => {
        const matchesStatus = !filter.status || filter.status === 'all' || deposit.status === filter.status
        const matchesUser = !filter.user_id || deposit.user_id === filter.user_id
        const matchesSearch =
          search === '' ||
          deposit.reference.toLowerCase().includes(search) ||
          deposit.id.toLowerCase().includes(search)
        return matchesStatus && matchesUser && matchesSearch
      })
      return paginate(rows, filter.page, filter.size ?? ADMIN_PAGE_SIZE)
    })
  }
  const params = new URLSearchParams({
    page: String(filter.page),
    size: String(filter.size ?? ADMIN_PAGE_SIZE),
    status: filter.status ?? 'pending',
  })
  if (filter.search?.trim()) params.set('search', filter.search.trim())
  if (filter.user_id) params.set('user_id', filter.user_id)
  const response = await api.get<Page<BackendAdminDeposit>>(`/admin/deposits?${params.toString()}`)
  return { ...response, rows: response.rows.map(toAdminDeposit) }
}

export type DepositReview = {
  id: string
  action: 'approve' | 'reject'
  amount_minor?: number | undefined
  reason?: string | undefined
}

export async function reviewDeposit(review: DepositReview): Promise<void> {
  if (usingTestFixtures) {
    const { adminDeposits, adminUserWallets, auditEntries } = await import('@/mocks/admin')
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
  if (usingTestFixtures) {
    const { adminUsers } = await import('@/mocks/admin')
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
  if (usingTestFixtures) {
    const { adminUsers } = await import('@/mocks/admin')
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
  if (usingTestFixtures) {
    const { adminUsers } = await import('@/mocks/admin')
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
  if (usingTestFixtures) {
    const { adminUserWallets } = await import('@/mocks/admin')
    return mockRequest(() => (adminUserWallets[id] ?? []).map((wallet) => ({ ...wallet })))
  }
  return api.get<Wallet[]>(`/admin/users/${id}/wallets`)
}

export async function fetchUserRounds(userId: string, page = 1): Promise<Page<AdminRound>> {
  return fetchAdminRounds({ page, user_id: userId })
}

export async function fetchUserDeposits(userId: string, page = 1): Promise<Page<AdminDeposit>> {
  if (usingTestFixtures) {
    const { adminDeposits } = await import('@/mocks/admin')
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
  if (usingTestFixtures) {
    const { adjustments } = await import('@/mocks/admin')
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
  if (usingTestFixtures) {
    const { adjustments, adminUsers, adminUserWallets, auditEntries } = await import('@/mocks/admin')
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
  if (usingTestFixtures) {
    const { transactions } = await import('@/mocks/wallet')
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

  // The Rounds tab reads the round resource instead. This adapter only maps
  // the immutable ledger and cannot combine wager and win into one filter.
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
  if (usingTestFixtures) {
    const { adminUsers, auditEntries } = await import('@/mocks/admin')
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
  if (usingTestFixtures) {
    const { adminGames } = await import('@/mocks/admin')
    return mockRequest(() => [...adminGames])
  }
  const page = await api.get<Page<AdminGame>>(`/admin/games?page=1&size=${ADMIN_CATALOGUE_SIZE}`)
  return page.rows
}

export async function fetchAdminGame(id: string): Promise<AdminGame | null> {
  if (usingTestFixtures) {
    const { adminGames } = await import('@/mocks/admin')
    return mockRequest(() => adminGames.find((game) => game.id === id) ?? null)
  }
  try {
    return await api.get<AdminGame>(`/admin/games/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function fetchAdminRtpConfiguration(
  id: string,
  basisPoints: number,
  rows: number,
  risk: 'low' | 'normal' | 'high',
): Promise<AdminRtpConfiguration | null> {
  if (usingTestFixtures) {
    const [{ adminGames, plinkoRtpConfiguration }, { isPlinkoRows, isPlinkoRisk }] = await Promise.all([
      import('@/mocks/admin'),
      import('@/features/gameplay/multipliers'),
    ])
    return mockRequest(() => {
      const game = adminGames.find((candidate) => candidate.id === id)
      if (!game || game.slug !== 'plinko') return null
      if (!game.rtp_options.includes(basisPoints) || !isPlinkoRows(rows) || !isPlinkoRisk(risk)) {
        throw new ApiError(400, 'One or more fields are invalid')
      }
      return plinkoRtpConfiguration(basisPoints, rows, risk)
    })
  }
  const params = new URLSearchParams({
    rtp_basis_points: String(basisPoints),
    rows: String(rows),
    risk,
  })
  try {
    return await api.get<AdminRtpConfiguration>(
      `/admin/games/${encodeURIComponent(id)}/rtp-configuration?${params.toString()}`,
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

// Every category, including ones with no active game: an operator files a
// game under a category before it has anything to show a player.
export async function fetchAllCategories(): Promise<Category[]> {
  if (usingTestFixtures) {
    const { categories } = await import('@/mocks/games')
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
  if (usingTestFixtures) {
    const [{ adminGames }, { categories, games }] = await Promise.all([
      import('@/mocks/admin'),
      import('@/mocks/games'),
    ])
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
        rtp_basis_points: null,
        rtp_options: [],
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
  if (usingTestFixtures) {
    const [{ adminGames }, { categories, games }] = await Promise.all([
      import('@/mocks/admin'),
      import('@/mocks/games'),
    ])
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

export type AdminRoundFilter = {
  page: number
  size?: number
  days?: 7 | 30 | 90
  status?: Round['status']
  currency?: Currency
  user_id?: string
  game_id?: string
  search?: string
}

export async function fetchAdminRounds(filter: AdminRoundFilter): Promise<Page<AdminRound>> {
  if (usingTestFixtures) {
    const [{ adminUsers }, { rounds }] = await Promise.all([
      import('@/mocks/admin'),
      import('@/mocks/wallet'),
    ])
    return mockRequest(() => {
      const cutoff = filter.days ? Date.now() - filter.days * 86_400_000 : null
      const fixtureUser = adminUsers[0]
      const matched = rounds
        .map((round) => ({
          ...round,
          user_id: fixtureUser?.id ?? 'us-0001',
          user_email: fixtureUser?.email ?? 'player@example.com',
          display_name: fixtureUser?.display_name ?? 'Player',
          wallet_id: 'wa-demo-php',
        }))
        .filter(
          (round) =>
            (cutoff === null || Date.parse(round.started_at) >= cutoff) &&
            (!filter.status || round.status === filter.status) &&
            (!filter.currency || round.currency === filter.currency) &&
            (!filter.user_id || round.user_id === filter.user_id) &&
            (!filter.game_id || round.game_id === filter.game_id),
        )
      const search = filter.search?.trim().toLowerCase() ?? ''
      return paginate(
        matched.filter((round) => search === '' || round.id.toLowerCase().includes(search)),
        filter.page,
        filter.size ?? ADMIN_PAGE_SIZE,
      )
    })
  }

  const params = new URLSearchParams({
    page: String(filter.page),
    size: String(filter.size ?? ADMIN_PAGE_SIZE),
  })
  if (filter.days) params.set('from', new Date(Date.now() - filter.days * 86_400_000).toISOString())
  if (filter.status) params.set('status', filter.status)
  if (filter.currency) params.set('currency', filter.currency)
  if (filter.user_id) params.set('user_id', filter.user_id)
  if (filter.game_id) params.set('game_id', filter.game_id)
  if (filter.search?.trim()) params.set('search', filter.search.trim())
  return api.get<Page<AdminRound>>(`/admin/rounds?${params.toString()}`)
}

// The server validates the value against the engine's options; the test fixture
// mirrors that so component coverage refuses the same input.
export async function setGameRtp(gameId: string, basisPoints: number): Promise<AdminGame> {
  if (usingTestFixtures) {
    const { adminGames } = await import('@/mocks/admin')
    return mockRequest(() => {
      const game = adminGames.find((candidate) => candidate.id === gameId)
      if (!game) {
        throw new ApiError(404, 'Game not found')
      }
      if (!game.rtp_options.includes(basisPoints)) {
        throw new ApiError(400, 'One or more fields are invalid', null, {
          rtp_basis_points: "Choose one of the game's RTP options",
        })
      }
      game.rtp_basis_points = basisPoints
      game.updated_at = new Date().toISOString()
      return { ...game }
    }, 400)
  }
  return api.put<AdminGame>(`/admin/games/${encodeURIComponent(gameId)}/rtp`, { rtp_basis_points: basisPoints })
}

export type PaymentMethodInput = {
  name: string
  description: string
  pay_to: string
  reference_required: boolean
  enabled: boolean
}

export async function fetchAdminPaymentMethods(): Promise<AdminPaymentMethod[]> {
  if (usingTestFixtures) {
    const { paymentMethods } = await import('@/mocks/wallet')
    return mockRequest(() =>
      paymentMethods.map((method, index) => ({
        ...method,
        sort_order: (index + 1) * 10,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      })),
    )
  }
  return api.get<AdminPaymentMethod[]>('/admin/payment-methods')
}

export async function createPaymentMethod(input: PaymentMethodInput): Promise<AdminPaymentMethod> {
  if (usingTestFixtures) {
    const { paymentMethods } = await import('@/mocks/wallet')
    return mockRequest(() => {
      if (paymentMethods.some((method) => method.name.toLowerCase() === input.name.toLowerCase())) {
        throw new ApiError(409, 'That payment method name is already taken', null, { name: 'Already taken' })
      }
      const now = new Date().toISOString()
      const created: AdminPaymentMethod = {
        id: `method-${Date.now()}`,
        ...input,
        sort_order: (paymentMethods.length + 1) * 10,
        created_at: now,
        updated_at: now,
      }
      paymentMethods.push(created)
      return created
    })
  }
  return api.post<AdminPaymentMethod>('/admin/payment-methods', input)
}

export async function updatePaymentMethod({
  id,
  patch,
}: {
  id: string
  patch: Partial<PaymentMethodInput>
}): Promise<AdminPaymentMethod> {
  if (usingTestFixtures) {
    const { paymentMethods } = await import('@/mocks/wallet')
    return mockRequest(() => {
      const method = paymentMethods.find((candidate) => candidate.id === id)
      if (!method) throw new ApiError(404, 'Payment method not found')
      Object.assign(method, patch)
      return {
        ...method,
        sort_order: (paymentMethods.indexOf(method) + 1) * 10,
        created_at: new Date(0).toISOString(),
        updated_at: new Date().toISOString(),
      }
    })
  }
  return api.patch<AdminPaymentMethod>(`/admin/payment-methods/${encodeURIComponent(id)}`, patch)
}

export type ConsoleSearchResults = {
  players: AdminUser[]
  deposits: AdminDeposit[]
  rounds: AdminRound[]
}

export async function fetchConsoleSearch(query: string, signal?: AbortSignal): Promise<ConsoleSearchResults> {
  const search = query.trim()
  if (search.length < 2) return { players: [], deposits: [], rounds: [] }
  if (usingTestFixtures) {
    const [players, deposits, rounds] = await Promise.all([
      fetchUsers({ status: 'all', search, page: 1 }),
      fetchAdminDeposits({ page: 1, size: 5, status: 'all', search }),
      fetchAdminRounds({ page: 1, size: 5, search }),
    ])
    return {
      players: players.rows.filter((player) => player.role === 'player').slice(0, 5),
      deposits: deposits.rows,
      rounds: rounds.rows,
    }
  }
  const encoded = encodeURIComponent(search)
  const options = signal ? { signal } : undefined
  const [players, deposits, rounds] = await Promise.all([
    api.get<Page<AdminUser>>(`/admin/users?page=1&size=5&role=player&search=${encoded}`, options),
    api.get<Page<BackendAdminDeposit>>(`/admin/deposits?page=1&size=5&status=all&search=${encoded}`, options),
    api.get<Page<AdminRound>>(`/admin/rounds?page=1&size=5&search=${encoded}`, options),
  ])
  return {
    players: players.rows,
    deposits: deposits.rows.map(toAdminDeposit),
    rounds: rounds.rows,
  }
}

export function reasonOptions(): readonly string[] {
  return adjustmentReasons
}
