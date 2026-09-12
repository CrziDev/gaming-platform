import { describe, expect, it } from 'vitest'

import { artBySlug, resolveGameArt } from '@/lib/gameArt'

const files = {
  '../assets/games/aurora-dice.png': '/assets/aurora-dice-a1b2c3.png',
  '../assets/games/neon-fruits.jpeg': '/assets/neon-fruits-d4e5f6.jpeg',
}

describe('artBySlug', () => {
  it('keys each file by its name without the extension', () => {
    const bySlug = artBySlug(files)
    expect(bySlug.get('aurora-dice')).toBe('/assets/aurora-dice-a1b2c3.png')
    expect(bySlug.get('neon-fruits')).toBe('/assets/neon-fruits-d4e5f6.jpeg')
    expect(bySlug.size).toBe(2)
  })
})

describe('resolveGameArt', () => {
  const bySlug = artBySlug(files)

  it('uses the local file that matches the slug', () => {
    expect(resolveGameArt(bySlug, { slug: 'aurora-dice', thumbnail_url: null })).toBe(
      '/assets/aurora-dice-a1b2c3.png',
    )
  })

  it('prefers art the server attached', () => {
    expect(
      resolveGameArt(bySlug, { slug: 'aurora-dice', thumbnail_url: '/art/reviewed.png' }),
    ).toBe('/art/reviewed.png')
  })

  it('is null when nothing matches so the placeholder renders', () => {
    expect(resolveGameArt(bySlug, { slug: 'coin-flip', thumbnail_url: null })).toBeNull()
  })
})
