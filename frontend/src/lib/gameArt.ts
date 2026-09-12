import type { Game } from '@/api/types'

type GameArtSource = Pick<Game, 'slug' | 'thumbnail_url'>

const localArt = import.meta.glob<string>('../assets/games/*.{png,jpg,jpeg,webp}', {
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

const local = artBySlug(localArt)

export function gameArtUrl(game: GameArtSource): string | null {
  return resolveGameArt(local, game)
}
