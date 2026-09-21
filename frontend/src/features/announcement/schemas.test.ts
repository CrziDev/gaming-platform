import { describe, expect, it } from 'vitest'

import { announcementSchema, endOfLocalDay, localDateValue } from './schemas'

describe('announcement dates', () => {
  it('converts a selected date to the end of that local day', () => {
    const end = endOfLocalDay('2099-09-30')
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
    expect(end.getSeconds()).toBe(59)
    expect(end.getMilliseconds()).toBe(999)
    expect(localDateValue(end.toISOString())).toBe('2099-09-30')
  })

  it('requires one line of text and a future date for dated announcements', () => {
    expect(
      announcementSchema.safeParse({ text: 'First\nSecond', duration: 'permanent', end_date: '' })
        .success,
    ).toBe(false)
    expect(
      announcementSchema.safeParse({ text: 'Notice', duration: 'dated', end_date: '2000-01-01' })
        .success,
    ).toBe(false)
  })

  it('counts Unicode code points rather than UTF-16 units', () => {
    expect(
      announcementSchema.safeParse({ text: '🎰'.repeat(280), duration: 'permanent', end_date: '' })
        .success,
    ).toBe(true)
    expect(
      announcementSchema.safeParse({ text: '🎰'.repeat(281), duration: 'permanent', end_date: '' })
        .success,
    ).toBe(false)
  })
})
