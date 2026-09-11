import { describe, expect, it } from 'vitest'

import { createDepositSchema } from './schemas'

describe('deposit schema', () => {
  const schema = createDepositSchema('USD', {
    currency: 'USD',
    min_minor: 500,
    max_minor: 25_000,
  })

  it('uses the limits supplied by the currency API', () => {
    const below = schema.safeParse({ method_id: 'method-1', amount: '4.99', reference: '' })
    const above = schema.safeParse({ method_id: 'method-1', amount: '250.01', reference: '' })

    expect(below.success).toBe(false)
    expect(above.success).toBe(false)
    expect(below.error?.issues[0]?.message).toContain('$5.00')
    expect(above.error?.issues[0]?.message).toContain('$250.00')
  })

  it('accepts an empty reference when the selected method does not require one', () => {
    expect(
      schema.safeParse({ method_id: 'method-1', amount: '100.00', reference: '' }).success,
    ).toBe(true)
  })
})
