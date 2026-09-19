import { ApiError } from '@/api/client'
import type { PlayRoundResponse, PlinkoManifest, Round } from '@/api/types'
import type { PlinkoParams } from '@/features/gameplay/multipliers'
import type { PlinkoBet } from '@/features/gameplay/PlinkoHistory'
import {
  PLINKO_MULTIPLIERS_HUNDREDTHS,
  PLINKO_RISKS,
  PLINKO_ROWS,
  plinkoMultipliers,
} from '@/features/gameplay/multipliers'
import type { Currency } from '@/lib/money'

import { minutesAgo } from './clock'
import { games } from './games'
import { rounds, transactions, wallets } from './wallet'

// The supplied game's slot weighting: each slot's chance decays by this factor
// per step away from the centre. It is the demo's stand-in for the server's
// verified profile, not an RTP of anything.
const PROBABILITY_DECAY = 0.24

export function pickPlinkoSlot(rows: number, random: () => number = Math.random): number {
  const slots = rows + 1
  const middle = (slots - 1) / 2
  const weights: number[] = []
  let sum = 0
  for (let i = 0; i < slots; i++) {
    const weight = Math.pow(PROBABILITY_DECAY, Math.abs(i - middle))
    weights.push(weight)
    sum += weight
  }

  const roll = random()
  let acc = 0
  for (let i = 0; i < slots; i++) {
    acc += (weights[i] ?? 0) / sum
    if (roll <= acc) return i
  }
  return Math.floor(middle)
}

export const DEMO_PLINKO_PROFILE_ID = 'rtp-demo-plinko'

// The demo's manifest: the supplied paytable in the wire shape the server serves.
export function plinkoManifest(): PlinkoManifest {
  const multipliers_hundredths: PlinkoManifest['multipliers_hundredths'] = {}
  for (const rows of PLINKO_ROWS) {
    const byRisk: Record<string, number[]> = {}
    for (const risk of PLINKO_RISKS) byRisk[risk] = [...PLINKO_MULTIPLIERS_HUNDREDTHS[rows][risk]]
    multipliers_hundredths[String(rows)] = byRisk
  }
  return { rtp_profile_id: DEMO_PLINKO_PROFILE_ID, rows: [...PLINKO_ROWS], risks: [...PLINKO_RISKS], multipliers_hundredths }
}

export type PlinkoSettlement = {
  stake_minor: number
  currency: Currency
  params: PlinkoParams
  idempotencyKey: string
}

const settled = new Map<string, PlayRoundResponse>()
let sequence = 0

export function settlePlinkoRound(input: PlinkoSettlement, random: () => number = Math.random): PlayRoundResponse {
  const replay = settled.get(input.idempotencyKey)
  if (replay) return replay

  const game = games.find((entry) => entry.slug === 'plinko')
  if (!game) {
    throw new ApiError(409, 'That game is not available right now', 'GAME_UNAVAILABLE')
  }

  const wallet = wallets.find((entry) => entry.currency === input.currency)
  if (!wallet || input.stake_minor > wallet.balance_minor) {
    throw new ApiError(409, 'Your balance is too low for that bet', 'INSUFFICIENT_BALANCE')
  }

  const table = plinkoMultipliers(input.params.rows, input.params.risk)
  const slot = pickPlinkoSlot(input.params.rows, random)
  const multiplier = table[slot]
  if (multiplier === undefined) {
    throw new ApiError(500, 'The game engine returned an unexpected result')
  }

  const win = Math.floor((input.stake_minor * multiplier) / 100)
  const balanceAfter = wallet.balance_minor - input.stake_minor + win
  if (!Number.isSafeInteger(win) || !Number.isSafeInteger(balanceAfter)) {
    throw new ApiError(409, 'That win cannot be credited safely', 'AMOUNT_OVERFLOW')
  }

  sequence += 1
  const now = new Date().toISOString()
  const round: Round = {
    id: `pl-${String(sequence).padStart(4, '0')}`,
    game_id: game.id,
    game_slug: game.slug,
    game_name: game.name,
    rtp_profile_id: DEMO_PLINKO_PROFILE_ID,
    status: 'settled',
    stake_minor: input.stake_minor,
    win_minor: win,
    multiplier_hundredths: multiplier,
    currency: input.currency,
    started_at: now,
    settled_at: now,
  }

  wallet.balance_minor = balanceAfter
  rounds.unshift(round)
  if (win > 0) {
    transactions.unshift({
      id: `tx-${round.id}-win`,
      kind: 'win',
      label: `Round win · ${game.name}`,
      reference: round.id,
      status: 'settled',
      amount_minor: win,
      currency: input.currency,
      created_at: now,
      round_id: round.id,
    })
  }
  transactions.unshift({
    id: `tx-${round.id}-stake`,
    kind: 'wager',
    label: `Stake · ${game.name}`,
    reference: round.id,
    status: 'settled',
    amount_minor: -input.stake_minor,
    currency: input.currency,
    created_at: now,
    round_id: round.id,
  })

  const response: PlayRoundResponse = {
    round,
    result: { slot },
    wallet: { ...wallet },
  }
  settled.set(input.idempotencyKey, response)
  return response
}

// A static bets feed under the board until settled rounds feed it.
const feed: [string, number, number, number][] = [
  ['Rayxa90', 1_000, 1700, 12],
  ['mariacruz', 2_000, 3300, 27],
  ['k1ngoff', 1_500, 400, 41],
  ['benj_04', 500, 50, 58],
  ['nina.dlc', 5_000, 1100, 75],
  ['sadbetsonly', 1_000, 20, 96],
  ['gregor56', 2_500, 800, 130],
  ['Rayxa90', 1_000, 110, 172],
]

export const recentBets: readonly PlinkoBet[] = feed.map(([player, stake, multiplier, secondsAgo], index) => ({
  id: `bet-${String(index + 1).padStart(2, '0')}`,
  player,
  stake_minor: stake,
  multiplier_hundredths: multiplier,
  profit_minor: Math.floor((stake * multiplier) / 100) - stake,
  currency: 'PHP',
  placed_at: minutesAgo(secondsAgo / 60),
}))
