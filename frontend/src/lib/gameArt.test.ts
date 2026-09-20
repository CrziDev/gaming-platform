import { describe, expect, it } from 'vitest'

import { artBySlug, resolveBannerArt, resolveGameArt } from '@/lib/gameArt'

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

describe('resolveBannerArt', () => {
  const thumbnails = artBySlug({ ...files, '../assets/games/plinko.png': '/assets/plinko-a1b2c3.png' })
  const banners = artBySlug({ '../assets/banners/plinko.png': '/assets/plinko-0f1e2d.png' })

  it('uses the banner file that matches the slug', () => {
    expect(resolveBannerArt(banners, thumbnails, { slug: 'plinko', thumbnail_url: null })).toBe(
      '/assets/plinko-0f1e2d.png',
    )
  })

  it('prefers the landscape banner over art the server attached', () => {
    expect(
      resolveBannerArt(banners, thumbnails, { slug: 'plinko', thumbnail_url: '/art/reviewed.png' }),
    ).toBe('/assets/plinko-0f1e2d.png')
  })

  it('falls back to the thumbnail when there is no banner', () => {
    expect(resolveBannerArt(banners, thumbnails, { slug: 'aurora-dice', thumbnail_url: null })).toBe(
      '/assets/aurora-dice-a1b2c3.png',
    )
  })

  it('is null when nothing matches so the placeholder renders', () => {
    expect(resolveBannerArt(banners, thumbnails, { slug: 'coin-flip', thumbnail_url: null })).toBeNull()
  })
})
