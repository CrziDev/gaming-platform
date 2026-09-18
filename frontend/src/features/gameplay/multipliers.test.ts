import { describe, expect, it } from 'vitest'

import {
  PLINKO_MULTIPLIERS_HUNDREDTHS,
  PLINKO_RISKS,
  PLINKO_ROWS,
  isPlinkoRisk,
  isPlinkoRows,
  plinkoMultipliers,
} from './multipliers'

describe('plinko multiplier tables', () => {
  it.each(PLINKO_ROWS)('%i rows has a symmetric table of rows + 1 positive integers per risk', (rows) => {
    for (const risk of PLINKO_RISKS) {
      const table = PLINKO_MULTIPLIERS_HUNDREDTHS[rows][risk]
      expect(table).toHaveLength(rows + 1)
      for (const value of table) {
        expect(Number.isSafeInteger(value)).toBe(true)
        expect(value).toBeGreaterThan(0)
      }
      for (let i = 0; i < table.length; i++) {
        expect(table[i]).toBe(table[table.length - 1 - i])
      }
    }
  })

  it('matches the supplied paytable at spot values', () => {
    expect(plinkoMultipliers(8, 'normal')).toEqual([600, 300, 170, 110, 50, 110, 170, 300, 600])
    expect(plinkoMultipliers(16, 'high')[0]).toBe(50000)
    expect(plinkoMultipliers(16, 'high')[16]).toBe(50000)
    expect(plinkoMultipliers(14, 'high')[7]).toBe(10)
    expect(plinkoMultipliers(12, 'low')).toHaveLength(13)
  })

  it('guards rows and risk values from outside', () => {
    expect(isPlinkoRows(8)).toBe(true)
    expect(isPlinkoRows(7)).toBe(false)
    expect(isPlinkoRows(16.5)).toBe(false)
    expect(isPlinkoRisk('normal')).toBe(true)
    expect(isPlinkoRisk('regular')).toBe(false)
  })
})
