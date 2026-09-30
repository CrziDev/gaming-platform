import { describe, expect, it } from 'vitest'

import { stakeLadder, stepStake } from './stake'

describe('stakeLadder', () => {
  it('walks 1-2-5 from the minimum to the maximum', () => {
    expect(stakeLadder({ min: 100, max: 500_000, step: 100 })).toEqual([
      100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000,
    ])
  })

  it('offers only stakes the server accepts, and always the limits', () => {
    const limits = { min: 150, max: 9_950, step: 100 }
    const ladder = stakeLadder(limits)
    expect(ladder[0]).toBe(150)
    expect(ladder[ladder.length - 1]).toBe(9_950)
    for (const stake of ladder) {
      expect(Number.isSafeInteger(stake)).toBe(true)
      expect(stake).toBeGreaterThanOrEqual(limits.min)
      expect(stake).toBeLessThanOrEqual(limits.max)
      expect((stake - limits.min) % limits.step).toBe(0)
    }
  })

  it('is the single stake when the limits are equal', () => {
    expect(stakeLadder({ min: 500, max: 500, step: 100 })).toEqual([500])
  })

  it('does not loop on limits it cannot use', () => {
    expect(stakeLadder({ min: 100, max: 1_000, step: 0 })).toEqual([100])
  })
})

describe('stepStake', () => {
  const ladder = [100, 200, 500, 1_000]

  it('moves one rung each way', () => {
    expect(stepStake(ladder, 200, 1)).toBe(500)
    expect(stepStake(ladder, 200, -1)).toBe(100)
  })

  it('moves a stake between rungs to the nearer rung in that direction', () => {
    expect(stepStake(ladder, 300, 1)).toBe(500)
    expect(stepStake(ladder, 300, -1)).toBe(200)
  })

  it('stays at either end', () => {
    expect(stepStake(ladder, 1_000, 1)).toBe(1_000)
    expect(stepStake(ladder, 100, -1)).toBe(100)
  })
})
