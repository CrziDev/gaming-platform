import type {
  AdminDeposit,
  AdminWithdrawal,
  AdminGame,
  AdminRtpConfiguration,
  AdminUser,
  Adjustment,
  AuditEntry,
  DashboardSummary,
  Wallet,
} from '@/api/types'
import {
  PLINKO_MULTIPLIERS_HUNDREDTHS,
  PLINKO_RISKS,
  PLINKO_ROWS,
  type PlinkoRisk,
  type PlinkoRows,
} from '@/features/gameplay/multipliers'

import { daysAgo, hoursAgo, minutesAgo, seeded } from './clock'
import { games } from './games'

export const dashboardSummary: DashboardSummary = {
  pending_deposits: 7,
  pending_held_minor: 1_840_000,
  oldest_pending_at: minutesAgo(22),
  approved_today_minor: 4_215_000,
  approved_today_count: 31,
  staked_today_minor: 9_672_000,
  returned_today_minor: 8_931_000,
  hold_today_minor: 741_000,
  rounds_today: 1204,
  players_today: 88,
  effective_rtp_basis_points: 9233,
  expected_rtp_basis_points: 9533,
  games: [
    {
      game_id: 'gm-004',
      game_slug: 'plinko',
      game_name: 'Plinko',
      rounds: 612,
      staked_minor: 4_120_000,
      returned_minor: 3_905_000,
      hold_minor: 215_000,
      effective_rtp_basis_points: 9478,
      expected_rtp_basis_points: 9500,
    },
    {
      game_id: 'gm-001',
      game_slug: 'aurora-dice',
      game_name: 'Aurora Dice',
      rounds: 388,
      staked_minor: 3_240_000,
      returned_minor: 3_410_000,
      hold_minor: -170_000,
      effective_rtp_basis_points: 10524,
      expected_rtp_basis_points: 9600,
    },
    {
      game_id: 'gm-002',
      game_slug: 'vault-break',
      game_name: 'Vault Break',
      rounds: 204,
      staked_minor: 2_312_000,
      returned_minor: 1_616_000,
      hold_minor: 696_000,
      effective_rtp_basis_points: 6989,
      expected_rtp_basis_points: 9500,
    },
  ],
  currency: 'PHP',
}

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

export const adminWithdrawals: AdminWithdrawal[] = [
  {
    id: 'wd-7731',
    user_id: 'us-0001',
    user_email: 'jmartinez@example.com',
    display_name: 'jmartinez',
    method_id: 'method-a',
    method_name: 'Method A',
    amount_minor: 150_000,
    currency: 'PHP',
    account_name: 'Jose Martinez',
    account_number: '0917 555 0142',
    status: 'pending',
    payout_reference: null,
    reason: null,
    created_at: minutesAgo(25),
    reviewed_at: null,
    cancelled_at: null,
  },
  {
    id: 'wd-7702',
    user_id: 'us-0001',
    user_email: 'jmartinez@example.com',
    display_name: 'jmartinez',
    method_id: 'method-a',
    method_name: 'Method A',
    amount_minor: 80_000,
    currency: 'PHP',
    account_name: 'Jose Martinez',
    account_number: '0917 555 0142',
    status: 'approved',
    payout_reference: 'PAYOUT-7702',
    reason: null,
    created_at: daysAgo(2),
    reviewed_at: daysAgo(2),
    cancelled_at: null,
  },
]

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
    action: 'game.rtp_change',
    entity: 'aurora-dice',
    detail: 'Changed Aurora Dice (aurora-dice) RTP from 95.00% to 105.00%',
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

// Plinko is the one integrated game and carries the engine's four options; the
// first fixture game runs above 100% so the danger reading has something to show.
const PLINKO_OPTIONS = [9_000, 9_500, 10_500, 11_000]

export const adminGames: AdminGame[] = games.map((game, index) => ({
  ...game,
  integration: game.slug === 'plinko' ? 'integrated' : index === 2 ? 'under_review' : 'supported',
  rtp_basis_points: game.slug === 'plinko' ? 9_500 : index === 0 ? 10_500 : index === 1 ? 9_500 : null,
  rtp_options: game.slug === 'plinko' || index === 0 ? PLINKO_OPTIONS : [],
  rounds_30d: [18_420, 12_880, 6_140][index] ?? 0,
  updated_at: game.created_at,
}))

export function plinkoRtpConfiguration(
  basisPoints: number,
  rows: PlinkoRows,
  risk: PlinkoRisk,
): AdminRtpConfiguration {
  const multipliers = PLINKO_MULTIPLIERS_HUNDREDTHS[rows][risk]
  const chances = rows === 10 && risk === 'normal'
    ? [303, 831, 2_273, 6_224, 17_041, 46_657, 17_041, 6_224, 2_273, 830, 303]
    : binomialChances(rows)
  return {
    configuration_ref: `plinko/${basisPoints}`,
    rtp_basis_points: basisPoints,
    rows: [...PLINKO_ROWS],
    risks: [...PLINKO_RISKS],
    selected_board: {
      rows,
      risk,
      theoretical_rtp_basis_points: basisPoints,
      slots: multipliers.map((multiplier, slot) => ({
        slot,
        multiplier_hundredths: multiplier,
        chance_thousandths_percent: chances[slot] ?? 0,
      })),
    },
  }
}

function binomialChances(rows: number): number[] {
  const weights = Array.from({ length: rows + 1 }, (_, slot) => choose(rows, slot))
  const total = 2 ** rows
  const floors = weights.map((weight) => Math.floor((weight * 100_000) / total))
  const missing = 100_000 - floors.reduce((sum, value) => sum + value, 0)
  const ranked = weights
    .map((weight, slot) => ({ slot, remainder: (weight * 100_000) % total }))
    .sort((a, b) => b.remainder - a.remainder || a.slot - b.slot)
  for (let i = 0; i < missing; i += 1) {
    const slot = ranked[i]?.slot ?? 0
    floors[slot] = (floors[slot] ?? 0) + 1
  }
  return floors
}

function choose(n: number, k: number): number {
  let result = 1
  for (let i = 1; i <= k; i += 1) result = (result * (n - i + 1)) / i
  return result
}
