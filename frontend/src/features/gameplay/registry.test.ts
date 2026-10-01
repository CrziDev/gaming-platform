import { describe, expect, it } from 'vitest'

import { gameModuleFor } from './registry'

describe('gameModuleFor', () => {
  it('runs each Plinko title in its own frame on the shared board', () => {
    const plinko = gameModuleFor('plinko')
    const billiards = gameModuleFor('plinko-billiards')
    expect(plinko?.frameUrl).toBe('/games/plinko/index.html')
    expect(billiards?.frameUrl).toBe('/games/plinko-billiards/index.html')
    expect(billiards?.Controls).toBe(plinko?.Controls)
    expect(billiards?.defaultParams).toEqual(plinko?.defaultParams)
  })

  it('has no module for a title without an engine', () => {
    expect(gameModuleFor('aurora-dice')).toBeNull()
  })
})
