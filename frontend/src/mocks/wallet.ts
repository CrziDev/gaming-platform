import type {
  DepositRequest,
  Notification,
  PaymentMethod,
  Round,
  Transaction,
  Wallet,
} from '@/api/types'

import { daysAgo, hoursAgo, minutesAgo, seeded } from './clock'

export const wallets: Wallet[] = [
  { currency: 'PHP', balance_minor: 525_000 },
  { currency: 'USD', balance_minor: 14_250 },
]

export const paymentMethods: PaymentMethod[] = [
  {
    id: 'method-a',
    name: 'Method A',
    description: 'Placeholder — awaiting provider list',
    pay_to: 'To be supplied',
    reference_required: true,
    enabled: true,
  },
  {
    id: 'method-b',
    name: 'Method B',
    description: 'Placeholder',
    pay_to: 'To be supplied',
    reference_required: true,
    enabled: false,
  },
]

export const depositLimits = {
  currency: 'PHP' as const,
  min_minor: 10_000,
  max_minor: 5_000_000,
  quick_amounts_minor: [50_000, 100_000, 250_000, 500_000],
}

export const depositRequests: DepositRequest[] = [
  {
    id: 'dep-8841',
    reference: '8841',
    method_id: 'method-a',
    method_name: 'Method A',
    amount_minor: 100_000,
    currency: 'PHP',
    status: 'pending',
    created_at: minutesAgo(12),
    reviewed_at: null,
    reason: null,
  },
  {
    id: 'dep-8802',
    reference: '8802',
    method_id: 'method-a',
    method_name: 'Method A',
    amount_minor: 250_000,
    currency: 'PHP',
    status: 'approved',
    created_at: daysAgo(1),
    reviewed_at: daysAgo(1),
    reason: null,
  },
  {
    id: 'dep-8790',
    reference: '8790',
    method_id: 'method-a',
    method_name: 'Method A',
    amount_minor: 300_000,
    currency: 'PHP',
    status: 'rejected',
    created_at: daysAgo(5),
    reviewed_at: daysAgo(5),
    reason: 'Reference number not found against the receiving account.',
  },
]

const anchored: Transaction[] = [
  {
    id: 'tx-0001',
    kind: 'deposit',
    label: 'Deposit · Method A',
    reference: '8841',
    status: 'pending',
    amount_minor: 100_000,
    currency: 'PHP',
    created_at: minutesAgo(12),
    round_id: null,
  },
  {
    id: 'tx-0002',
    kind: 'win',
    label: 'Round win · Vault Break',
    reference: '41-209',
    status: 'settled',
    amount_minor: 42_000,
    currency: 'PHP',
    created_at: minutesAgo(37),
    round_id: '41-209',
  },
  {
    id: 'tx-0003',
    kind: 'wager',
    label: 'Stake · Vault Break',
    reference: '41-209',
    status: 'settled',
    amount_minor: -15_000,
    currency: 'PHP',
    created_at: minutesAgo(37),
    round_id: '41-209',
  },
  {
    id: 'tx-0004',
    kind: 'deposit',
    label: 'Deposit · Method A',
    reference: '8802',
    status: 'approved',
    amount_minor: 250_000,
    currency: 'PHP',
    created_at: daysAgo(1),
    round_id: null,
  },
  {
    id: 'tx-0005',
    kind: 'adjustment',
    label: 'Admin credit · adjustment',
    reference: 'ADJ-114',
    status: 'applied',
    amount_minor: 50_000,
    currency: 'PHP',
    created_at: daysAgo(7),
    round_id: null,
  },
]

function generated(): Transaction[] {
  const random = seeded(90210)
  const gameNames = ['Aurora Dice', 'Vault Break', 'Skyline Crash']
  const rows: Transaction[] = []

  for (let index = 0; index < 57; index += 1) {
    const gameName = gameNames[Math.floor(random() * gameNames.length)] as string
    const roundId = `41-${180 - index}`
    const stake = (Math.floor(random() * 8) + 1) * 5_000
    const won = random() > 0.6

    rows.push({
      id: `tx-${(index + 6).toString().padStart(4, '0')}`,
      kind: 'wager',
      label: `Stake · ${gameName}`,
      reference: roundId,
      status: 'settled',
      amount_minor: -stake,
      currency: 'PHP',
      created_at: hoursAgo(8 + index * 3),
      round_id: roundId,
    })

    if (won) {
      rows.push({
        id: `tx-${(index + 6).toString().padStart(4, '0')}w`,
        kind: 'win',
        label: `Round win · ${gameName}`,
        reference: roundId,
        status: 'settled',
        amount_minor: stake * (Math.floor(random() * 3) + 2),
        currency: 'PHP',
        created_at: hoursAgo(8 + index * 3),
        round_id: roundId,
      })
    }
  }

  return rows
}

export const transactions: Transaction[] = [...anchored, ...generated()].sort(
  (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
)

export const rounds: Round[] = transactions
  .filter((transaction) => transaction.kind === 'wager')
  .map((stake) => {
    const win = transactions.find(
      (transaction) => transaction.kind === 'win' && transaction.round_id === stake.round_id,
    )
    const stakeAmount = Math.abs(stake.amount_minor)

    return {
      id: stake.round_id ?? stake.id,
      game_slug: stake.label.includes('Aurora')
        ? 'aurora-dice'
        : stake.label.includes('Skyline')
          ? 'skyline-crash'
          : 'vault-break',
      game_name: stake.label.replace('Stake · ', ''),
      stake_minor: stakeAmount,
      multiplier_hundredths: win ? Math.round((win.amount_minor / stakeAmount) * 100) : null,
      result_minor: win ? win.amount_minor - stakeAmount : -stakeAmount,
      currency: 'PHP' as const,
      created_at: stake.created_at,
    }
  })

export const notifications: Notification[] = [
  {
    id: 'nt-1',
    message: 'Deposit approved',
    amount_minor: 200_000,
    currency: 'PHP',
    created_at: minutesAgo(2),
    read: false,
  },
  {
    id: 'nt-2',
    message: 'Deposit rejected — reference not found',
    amount_minor: null,
    currency: null,
    created_at: daysAgo(1),
    read: true,
  },
  {
    id: 'nt-3',
    message: 'Balance credited by support',
    amount_minor: 50_000,
    currency: 'PHP',
    created_at: daysAgo(3),
    read: true,
  },
]

export const walletSummary = {
  currency: 'PHP' as const,
  deposited_30d_minor: 650_000,
  staked_30d_minor: 324_000,
  returned_30d_minor: 299_000,
}
