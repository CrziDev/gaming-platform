import { describe, expect, it } from 'vitest'

import { safeRedirect } from '@/routes/paths'

describe('safeRedirect', () => {
  it('returns null when nothing was captured', () => {
    expect(safeRedirect(undefined)).toBeNull()
  })

  it('keeps the search string and hash, because they are part of where someone was', () => {
    expect(safeRedirect({ pathname: '/history', search: '?tab=rounds', hash: '#recent' })).toBe(
      '/history?tab=rounds#recent',
    )
  })

  it('refuses a protocol-relative path, which is an open redirect', () => {
    expect(safeRedirect({ pathname: '//evil.test', search: '', hash: '' })).toBeNull()
  })

  it('refuses an absolute URL', () => {
    expect(safeRedirect({ pathname: 'https://evil.test/', search: '', hash: '' })).toBeNull()
  })
})
