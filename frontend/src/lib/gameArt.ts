import type { Game } from '@/api/types'

type GameArtSource = Pick<Game, 'slug' | 'thumbnail_url'>

const localArt = import.meta.glob<string>('../assets/games/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

const localBanners = import.meta.glob<string>('../assets/banners/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

const localPhoneBanners = import.meta.glob<string>('../assets/banners/phone/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

export function artBySlug(files: Record<string, string>): Map<string, string> {
  const bySlug = new Map<string, string>()
  for (const [path, url] of Object.entries(files)) {
    const file = path.slice(path.lastIndexOf('/') + 1)
    const slug = file.slice(0, file.lastIndexOf('.'))
    bySlug.set(slug, url)
  }
  return bySlug
}

export function resolveGameArt(bySlug: Map<string, string>, game: GameArtSource): string | null {
  return game.thumbnail_url ?? bySlug.get(game.slug) ?? null
}

// The lobby banner is landscape, so a title's own banner file wins over its portrait
// thumbnail; a title with neither keeps the placeholder.
export function resolveBannerArt(
  banners: Map<string, string>,
  thumbnails: Map<string, string>,
  game: GameArtSource,
): string | null {
  return banners.get(game.slug) ?? resolveGameArt(thumbnails, game)
}

// A phone banner sets the game beside the copy in a narrower panel; a title without one
// shows its landscape banner there too.
export function resolvePhoneBannerArt(
  phoneBanners: Map<string, string>,
  banners: Map<string, string>,
  thumbnails: Map<string, string>,
  game: GameArtSource,
): string | null {
  return phoneBanners.get(game.slug) ?? resolveBannerArt(banners, thumbnails, game)
}

const local = artBySlug(localArt)
const localBanner = artBySlug(localBanners)
const localPhoneBanner = artBySlug(localPhoneBanners)

export function gameArtUrl(game: GameArtSource): string | null {
  return resolveGameArt(local, game)
}

export function bannerArtUrl(game: GameArtSource): string | null {
  return resolveBannerArt(localBanner, local, game)
}

export function phoneBannerArtUrl(game: GameArtSource): string | null {
  return resolvePhoneBannerArt(localPhoneBanner, localBanner, local, game)
}
