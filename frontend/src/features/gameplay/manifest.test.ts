import { describe, expect, it } from 'vitest'

import { plinkoManifest } from '@/mocks/plinko'

import { PLINKO_MULTIPLIERS_HUNDREDTHS } from './multipliers'
import { plinkoManifestSchema } from './schemas'

describe('the Plinko manifest schema', () => {
  it('parses the served shape into a table keyed by rows and risk', () => {
    const parsed = plinkoManifestSchema.parse(plinkoManifest())

    expect(parsed.rtp_profile_id).toBe('rtp-demo-plinko')
    expect(parsed.table[8].normal).toEqual(PLINKO_MULTIPLIERS_HUNDREDTHS[8].normal)
    expect(parsed.table[16].high).toHaveLength(17)
  })

  it('tolerates fields it does not know', () => {
    expect(() => plinkoManifestSchema.parse({ ...plinkoManifest(), engine: 'plinko' })).not.toThrow()
  })

  it('refuses a board with the wrong number of slots', () => {
    const manifest = plinkoManifest()
    manifest.multipliers_hundredths['12']!.low = manifest.multipliers_hundredths['12']!.low!.slice(1)

    const result = plinkoManifestSchema.safeParse(manifest)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['multipliers_hundredths', '12', 'low'])
  })

  it('refuses a manifest missing a board the controls offer', () => {
    const manifest = plinkoManifest()
    delete manifest.multipliers_hundredths['16']

    expect(plinkoManifestSchema.safeParse(manifest).success).toBe(false)
  })

  it('refuses a multiplier that is not a positive integer', () => {
    const fractional = plinkoManifest()
    fractional.multipliers_hundredths['8']!.normal![4] = 0.5
    expect(plinkoManifestSchema.safeParse(fractional).success).toBe(false)

    const zero = plinkoManifest()
    zero.multipliers_hundredths['8']!.normal![4] = 0
    expect(plinkoManifestSchema.safeParse(zero).success).toBe(false)
  })

  it('refuses a manifest that does not name its profile', () => {
    expect(plinkoManifestSchema.safeParse({ ...plinkoManifest(), rtp_profile_id: '' }).success).toBe(false)
  })
})
