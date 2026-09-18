import { beforeEach, describe, expect, it, vi } from 'vitest'

import { plinkoMultipliers } from '@/features/gameplay/multipliers'
import { seeded } from '@/mocks/clock'

import { pickPlinkoSlot } from './plinko'

// Each settlement test gets untouched fixtures; the client module is reloaded
// with them so the thrown error is the same ApiError class the fixture uses.
async function freshFixtures() {
  vi.resetModules()
  const [plinko, wallet, client] = await Promise.all([import('./plinko'), import('./wallet'), import('@/api/client')])
  return { ...plinko, ...wallet, ApiError: client.ApiError }
}

describe('pickPlinkoSlot', () => {
  it('is deterministic for a seeded source and stays on the board', () => {
    const first = Array.from({ length: 50 }, (_, i) => pickPlinkoSlot(8, seeded(i)))
    const second = Array.from({ length: 50 }, (_, i) => pickPlinkoSlot(8, seeded(i)))
    expect(first).toEqual(second)
    for (const slot of first) {
      expect(slot).toBeGreaterThanOrEqual(0)
      expect(slot).toBeLessThanOrEqual(8)
    }
  })

  it('lands near the centre far more often than at the edges', () => {
    const random = seeded(7)
    const counts = new Array<number>(9).fill(0)
    const samples = 20_000
    for (let i = 0; i < samples; i++) {
      const slot = pickPlinkoSlot(8, random)
      counts[slot] = (counts[slot] ?? 0) + 1
    }
    expect((counts[4] ?? 0) / samples).toBeGreaterThan(0.55)
    expect((counts[0] ?? 0) / samples).toBeLessThan(0.01)
    expect((counts[8] ?? 0) / samples).toBeLessThan(0.01)
  })
})

describe('settlePlinkoRound', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('debits the stake, credits the win, and records the round and both ledger rows', async () => {
    const { settlePlinkoRound, wallets, transactions, rounds } = await freshFixtures()
    const before = wallets.find((w) => w.currency === 'PHP')?.balance_minor ?? 0
    const table = plinkoMultipliers(8, 'normal')

    const response = settlePlinkoRound(
      { stake_minor: 10_000, currency: 'PHP', params: { rows: 8, risk: 'normal' }, idempotencyKey: 'k1' },
      seeded(3),
    )

    const slot = response.result.slot as number
    const win = Math.floor((10_000 * (table[slot] ?? 0)) / 100)
    expect(response.round.win_minor).toBe(win)
    expect(response.round.multiplier_hundredths).toBe(table[slot])
    expect(response.round.status).toBe('settled')
    expect(response.round.game_id).toBe('gm-004')
    expect(response.wallet.balance_minor).toBe(before - 10_000 + win)
    expect(wallets.find((w) => w.currency === 'PHP')?.balance_minor).toBe(before - 10_000 + win)
    expect(rounds[0]?.id).toBe(response.round.id)

    const stake = transactions.find((t) => t.round_id === response.round.id && t.kind === 'wager')
    expect(stake?.amount_minor).toBe(-10_000)
    const credit = transactions.find((t) => t.round_id === response.round.id && t.kind === 'win')
    expect(credit?.amount_minor).toBe(win)
  })

  it('refuses a stake above the balance and leaves the fixtures untouched', async () => {
    const { settlePlinkoRound, wallets, transactions, rounds, ApiError } = await freshFixtures()
    const before = wallets.find((w) => w.currency === 'PHP')?.balance_minor ?? 0
    const ledger = transactions.length
    const played = rounds.length

    let caught: unknown
    try {
      settlePlinkoRound({ stake_minor: before + 100, currency: 'PHP', params: { rows: 8, risk: 'normal' }, idempotencyKey: 'k2' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as InstanceType<typeof ApiError>).status).toBe(409)
    expect((caught as InstanceType<typeof ApiError>).code).toBe('INSUFFICIENT_BALANCE')
    expect(wallets.find((w) => w.currency === 'PHP')?.balance_minor).toBe(before)
    expect(transactions).toHaveLength(ledger)
    expect(rounds).toHaveLength(played)
  })

  it('replays the same round for the same idempotency key without debiting twice', async () => {
    const { settlePlinkoRound, wallets } = await freshFixtures()
    const input = { stake_minor: 500, currency: 'PHP' as const, params: { rows: 10 as const, risk: 'high' as const }, idempotencyKey: 'k3' }

    const first = settlePlinkoRound(input, seeded(1))
    const after = wallets.find((w) => w.currency === 'PHP')?.balance_minor
    const second = settlePlinkoRound(input, seeded(99))

    expect(second.round.id).toBe(first.round.id)
    expect(wallets.find((w) => w.currency === 'PHP')?.balance_minor).toBe(after)
  })
})
