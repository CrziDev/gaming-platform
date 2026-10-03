import { describe, expect, it, vi } from 'vitest'

import { formatDateTimeCompact, formatQuantity } from '@/lib/format'

describe('formatQuantity', () => {
  it('uses the singular for exactly one and groups larger counts', () => {
    expect(formatQuantity(1, 'player')).toBe('1 player')
    expect(formatQuantity(0, 'player')).toBe('0 players')
    expect(formatQuantity(1204, 'round')).toBe('1,204 rounds')
  })
})

describe('formatDateTimeCompact', () => {
  it('leaves out the year only when it is the current one', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
    try {
      expect(formatDateTimeCompact('2026-10-03T08:37:00Z')).not.toMatch(/2026/)
      expect(formatDateTimeCompact('2025-12-31T08:37:00Z')).toMatch(/2025/)
    } finally {
      vi.useRealTimers()
    }
  })
})
