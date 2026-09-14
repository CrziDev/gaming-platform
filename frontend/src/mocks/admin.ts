import type {
  AdminDeposit,
  AdminGame,
  AdminUser,
  Adjustment,
  AuditEntry,
  ConsoleAlert,
  DashboardSummary,
  RtpProfile,
  Wallet,
} from '@/api/types'

import { daysAgo, hoursAgo, minutesAgo, seeded } from './clock'
import { games } from './games'

export const dashboardSummary: DashboardSummary = {
  pending_deposits: 7,
  pending_held_minor: 1_840_000,
  oldest_pending_at: minutesAgo(22),
  approved_today_minor: 4_215_000,
  approved_today_count: 31,
  staked_today_minor: 9_672_000,
  rounds_today: 1204,
  players_today: 88,
  returned_today_minor: 8_931_000,
  effective_rtp_basis_points: 9230,
  target_rtp_basis_points: 9400,
  currency: 'PHP',
}

export const consoleAlerts: ConsoleAlert[] = [
  { id: 'al-1', tone: 'warning', message: '1 deposit waiting over 20 min', href: '/admin/deposits' },
  { id: 'al-2', tone: 'neutral', message: 'Skyline Crash disabled by operator', href: '/admin/games' },
  { id: 'al-3', tone: 'danger', message: 'Aurora Dice RTP set to 102% · ends 18:00', href: '/admin/rtp' },
]

const firstNames = ['juan', 'ana', 'dee', 'kris', 'mia', 'leo', 'noel', 'rita', 'sam', 'tess']
const lastNames = ['martinez', 'rivera', 'tan', 'severino', 'lopez', 'cruz', 'reyes', 'diaz', 'uy', 'go']

function buildUsers(): { users: AdminUser[]; wallets: Record<string, Wallet[]> } {
  const random = seeded(4182)
  const users: AdminUser[] = []
  const wallets: Record<string, Wallet[]> = {}

  for (let index = 0; index < 88; index += 1) {
    const first = firstNames[index % firstNames.length] as string
    const last = lastNames[Math.floor(random() * lastNames.length)] as string
    const username = `${first[0]}${last}${index > 9 ? index : ''}`
    const suspended = index % 22 === 7
    const balance = suspended ? 0 : Math.floor(random() * 1400) * 1000
    const id = `us-${(index + 1).toString().padStart(4, '0')}`

    users.push({
      id,
      email: `${username}@example.com`,
      display_name: username,
      role: 'player',
      status: suspended ? 'suspended' : 'active',
      created_at: daysAgo(30 + index * 3),
    })
    wallets[id] = [
      { currency: 'PHP', balance_minor: balance },
      { currency: 'USD', balance_minor: 0 },
    ]
  }

  users[0] = {
    ...(users[0] as AdminUser),
    id: 'us-0001',
    display_name: 'jmartinez',
    email: 'jmartinez@example.com',
    status: 'active',
    created_at: daysAgo(100),
  }
  wallets['us-0001'] = [
    { currency: 'PHP', balance_minor: 525_000 },
    { currency: 'USD', balance_minor: 24_500 },
  ]

  return { users, wallets }
}

const userFixtures = buildUsers()
export const adminUsers = userFixtures.users
export const adminUserWallets = userFixtures.wallets

export const adminDeposits: AdminDeposit[] = [
  {
    id: 'dep-8841',
    reference: '8841',
    method_id: 'method-a',
    method_name: 'Method A',
    amount_minor: 100_000,
    currency: 'PHP',
    status: 'pending',
    created_at: minutesAgo(22),
    reviewed_at: null,
    reason: null,
    user_id: 'us-0001',
    username: 'jmartinez',
    user_balance_minor: 215_000,
    approved_count: 4,
    rejected_count: 0,
  },
  {
    id: 'dep-8840',
    reference: '8840',
    method_id: 'method-a',
    method_name: 'Method A',
    amount_minor: 500_000,
    currency: 'PHP',
    status: 'pending',
    created_at: minutesAgo(14),
    reviewed_at: null,
    reason: null,
    user_id: 'us-0002',
    username: 'arivera',
    user_balance_minor: 0,
    approved_count: 1,
    rejected_count: 1,
  },
  {
    id: 'dep-8839',
    reference: '8839',
    method_id: 'method-b',
    method_name: 'Method B',
    amount_minor: 250_000,
    currency: 'PHP',
    status: 'pending',
    created_at: minutesAgo(9),
    reviewed_at: null,
    reason: null,
    user_id: 'us-0003',
    username: 'dtan',
    user_balance_minor: 64_000,
    approved_count: 2,
    rejected_count: 0,
  },
  {
    id: 'dep-8838',
    reference: '8838',
    method_id: 'method-a',
    method_name: 'Method A',
    amount_minor: 90_000,
    currency: 'PHP',
    status: 'pending',
    created_at: minutesAgo(4),
    reviewed_at: null,
    reason: null,
    user_id: 'us-0004',
    username: 'kseverino',
    user_balance_minor: 1_290_000,
    approved_count: 9,
    rejected_count: 0,
  },
  {
    id: 'dep-8837',
    reference: '8837',
    method_id: 'method-a',
    method_name: 'Method A',
    amount_minor: 350_000,
    currency: 'PHP',
    status: 'pending',
    created_at: minutesAgo(3),
    reviewed_at: null,
    reason: null,
    user_id: 'us-0005',
    username: 'mlopez',
    user_balance_minor: 42_000,
    approved_count: 3,
    rejected_count: 0,
  },
  {
    id: 'dep-8836',
    reference: '8836',
    method_id: 'method-a',
    method_name: 'Method A',
    amount_minor: 400_000,
    currency: 'PHP',
    status: 'pending',
    created_at: minutesAgo(2),
    reviewed_at: null,
    reason: null,
    user_id: 'us-0006',
    username: 'lcruz',
    user_balance_minor: 118_000,
    approved_count: 5,
    rejected_count: 1,
  },
  {
    id: 'dep-8835',
    reference: '8835',
    method_id: 'method-b',
    method_name: 'Method B',
    amount_minor: 150_000,
    currency: 'PHP',
    status: 'pending',
    created_at: minutesAgo(1),
    reviewed_at: null,
    reason: null,
    user_id: 'us-0007',
    username: 'treyes',
    user_balance_minor: 0,
    approved_count: 0,
    rejected_count: 0,
  },
]

export const adjustments: Adjustment[] = [
  {
    id: 'adj-114',
    user_id: 'us-0001',
    amount_minor: 50_000,
    currency: 'PHP',
    reason: 'Goodwill — delayed deposit review',
    operator: 'R. Cruz',
    created_at: daysAgo(7),
  },
  {
    id: 'adj-109',
    user_id: 'us-0001',
    amount_minor: -20_000,
    currency: 'PHP',
    reason: 'Duplicate credit reversed',
    operator: 'A. Reyes',
    created_at: daysAgo(19),
  },
]

export const adjustmentReasons = [
  'Goodwill — delayed deposit review',
  'Deposit credited manually',
  'Duplicate credit reversed',
  'Chargeback recovered',
  'Promotional credit',
] as const

export const auditEntries: AuditEntry[] = [
  {
    id: 'au-1',
    created_at: hoursAgo(1),
    operator: 'R. Cruz',
    action: 'deposit.approve',
    entity: '8837',
    detail: 'Approved 8837 · +₱1,500.00 to mlopez',
  },
  {
    id: 'au-2',
    created_at: hoursAgo(2),
    operator: 'R. Cruz',
    action: 'deposit.reject',
    entity: '8836',
    detail: 'Rejected 8836 · reason: proof unreadable',
  },
  {
    id: 'au-3',
    created_at: hoursAgo(3),
    operator: 'A. Reyes',
    action: 'rtp.activate',
    entity: 'aurora-dice',
    detail: 'Set Aurora Dice RTP 102% until 18:00',
  },
  {
    id: 'au-4',
    created_at: hoursAgo(5),
    operator: 'A. Reyes',
    action: 'wallet.credit',
    entity: 'dtan',
    detail: 'Credited dtan ₱500.00 · adjustment',
  },
  {
    id: 'au-5',
    created_at: daysAgo(1),
    operator: 'R. Cruz',
    action: 'user.suspend',
    entity: 'PL-004199',
    detail: 'Suspended account · reason: duplicate registration',
  },
]

export const adminGames: AdminGame[] = games.map((game, index) => ({
  ...game,
  integration: index === 2 ? 'under_review' : 'supported',
  active_rtp_basis_points: [10_200, 9_400, 9_600][index] ?? null,
  rounds_30d: [18_420, 12_880, 6_140][index] ?? 0,
  updated_at: game.created_at,
}))

const profile = (
  id: string,
  game: AdminGame,
  name: string,
  version: number,
  target: number,
  status: RtpProfile['status'],
  operator: string,
  created: string,
  until: string | null = null,
  isDefault = status === 'active' && until === null,
): RtpProfile => ({
  id,
  game_id: game.id,
  game_slug: game.slug,
  game_name: game.name,
  name,
  version,
  target_basis_points: target,
  status,
  engine_config_ref: '',
  theoretical_basis_points: status === 'draft' ? null : target,
  observed_basis_points: status === 'draft' ? null : target,
  verified_at: status === 'draft' ? null : created,
  effective_from: null,
  effective_until: until,
  is_default: isDefault,
  created_by: '',
  created_by_display_name: operator,
  created_at: created,
  updated_at: created,
})

export const rtpProfiles: RtpProfile[] = [
  profile('rtp-1', adminGames[0]!, 'Promo', 1, 10_200, 'active', 'A. Reyes', hoursAgo(3), hoursAgo(-6)),
  profile('rtp-2', adminGames[0]!, 'Standard', 1, 9_400, 'verified', 'A. Reyes', daysAgo(4), null, true),
  profile('rtp-3', adminGames[1]!, 'Standard', 1, 9_400, 'active', 'R. Cruz', daysAgo(12)),
  profile('rtp-4', adminGames[2]!, 'Standard', 1, 9_600, 'retired', 'R. Cruz', daysAgo(40)),
  profile('rtp-5', adminGames[2]!, 'Standard', 2, 9_600, 'draft', 'R. Cruz', daysAgo(2)),
]

export const staffAccounts = [
  { id: 'st-1', name: 'R. Cruz', email: 'r.cruz@ops.example.com', role: 'Operator', enabled: true },
  { id: 'st-2', name: 'A. Reyes', email: 'a.reyes@ops.example.com', role: 'Owner', enabled: true },
  { id: 'st-3', name: 'M. Villa', email: 'm.villa@ops.example.com', role: 'Operator', enabled: false },
]
