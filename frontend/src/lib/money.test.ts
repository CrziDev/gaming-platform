import { describe, expect, it } from 'vitest'

import {
  addMoney,
  formatMoney,
  money,
  moneyDirection,
  parseMoneyInput,
  subtractMoney,
} from '@/lib/money'

describe('formatMoney', () => {
  it('renders minor units as major units without touching a float', () => {
    expect(formatMoney(money(525_000))).toBe('₱5,250.00')
    expect(formatMoney(money(1))).toBe('₱0.01')
    expect(formatMoney(money(0))).toBe('₱0.00')
  })

  it('groups thousands and keeps both decimal places', () => {
    expect(formatMoney(money(123_456_789))).toBe('₱1,234,567.89')
  })

  it('uses a true minus sign for debits and an optional plus for credits', () => {
    expect(formatMoney(money(-10_000))).toBe('−₱100.00')
    expect(formatMoney(money(10_000), { sign: 'always' })).toBe('+₱100.00')
    expect(formatMoney(money(-10_000), { sign: 'always' })).toBe('−₱100.00')
  })

  it('trims decimals only when they are zero', () => {
    expect(formatMoney(money(525_000), { decimals: 'trim' })).toBe('₱5,250')
    expect(formatMoney(money(525_050), { decimals: 'trim' })).toBe('₱5,250.50')
  })

  it('is exact at values a float would round', () => {
    expect(formatMoney(money(1_010))).toBe('₱10.10')
    expect(formatMoney(money(70_000_000_001))).toBe('₱700,000,000.01')
  })

  it('refuses integers that JSON cannot represent exactly', () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 1)).toThrow(/exact integer/)
  })
})

describe('parseMoneyInput', () => {
  it('reads typed major units back as integer minor units', () => {
    expect(parseMoneyInput('1000')).toBe(100_000)
    expect(parseMoneyInput('1,000.50')).toBe(100_050)
    expect(parseMoneyInput('0.01')).toBe(1)
  })

  it('refuses anything it cannot represent exactly', () => {
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('abc')).toBeNull()
    expect(parseMoneyInput('1.234')).toBeNull()
    expect(parseMoneyInput('1e3')).toBeNull()
  })

  it('round-trips through formatting', () => {
    const original = money(4_299_99)
    expect(parseMoneyInput(formatMoney(original, { symbol: false }))).toBe(original.amount_minor)
  })
})

describe('money arithmetic', () => {
  it('adds and subtracts in minor units', () => {
    expect(addMoney(money(525_000), money(100_000)).amount_minor).toBe(625_000)
    expect(subtractMoney(money(525_000), money(50_000)).amount_minor).toBe(475_000)
  })

  it('refuses to mix currencies, because there is no conversion anywhere', () => {
    expect(() => addMoney(money(100, 'PHP'), money(100, 'USD'))).toThrow()
  })

  it('refuses an arithmetic result outside the exact integer range', () => {
    expect(() => addMoney(money(Number.MAX_SAFE_INTEGER), money(1))).toThrow(/exact integer/)
  })

  it('reports direction so sign and colour can stay redundant', () => {
    expect(moneyDirection(money(1))).toBe('credit')
    expect(moneyDirection(money(-1))).toBe('debit')
    expect(moneyDirection(money(0))).toBe('zero')
  })
})
