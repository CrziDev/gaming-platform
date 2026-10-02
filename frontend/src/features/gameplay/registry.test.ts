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

  it('gives Plinko Tropical its own frame, stage, and title mark on the shared board', () => {
    const plinko = gameModuleFor('plinko')
    const tropical = gameModuleFor('plinko-tropical')
    expect(tropical?.frameUrl).toBe('/games/plinko-tropical/index.html')
    expect(tropical?.Controls).toBe(plinko?.Controls)
    expect(tropical?.defaultParams).toEqual(plinko?.defaultParams)
    expect(tropical).toMatchObject({ stageAspect: 0.98, stageGutter: 12, titleOverlap: 30, skin: false })
    expect(tropical?.TitleMark).not.toBeNull()
    expect(plinko).toMatchObject({ titleOverlap: 0, TitleMark: null })
  })

  it('has no module for a title without an engine', () => {
    expect(gameModuleFor('aurora-dice')).toBeNull()
  })
})
