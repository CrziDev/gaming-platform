import type { Category, Game, LobbyRow } from '@/api/types'

export const categories: Category[] = [
  { slug: 'originals', name: 'Originals', game_count: 2, available: true },
  { slug: 'crash', name: 'Crash', game_count: 1, available: true },
  { slug: 'slots', name: 'Slots', game_count: 0, available: false },
  { slug: 'live', name: 'Live dealers', game_count: 0, available: false },
]

export const games: Game[] = [
  {
    id: 'gm-001',
    slug: 'aurora-dice',
    name: 'Aurora Dice',
    category_slug: 'originals',
    category_name: 'Originals',
    provider: 'In-house',
    status: 'active',
    currency: 'PHP',
    min_wager_minor: 100,
    max_wager_minor: 5_000_00,
    wager_step_minor: 100,
    art_seed: 214,
  },
  {
    id: 'gm-002',
    slug: 'vault-break',
    name: 'Vault Break',
    category_slug: 'originals',
    category_name: 'Originals',
    provider: 'In-house',
    status: 'active',
    currency: 'PHP',
    min_wager_minor: 100,
    max_wager_minor: 5_000_00,
    wager_step_minor: 100,
    art_seed: 47,
  },
  {
    id: 'gm-003',
    slug: 'skyline-crash',
    name: 'Skyline Crash',
    category_slug: 'crash',
    category_name: 'Crash',
    provider: 'In-house',
    status: 'active',
    currency: 'PHP',
    min_wager_minor: 100,
    max_wager_minor: 5_000_00,
    wager_step_minor: 100,
    art_seed: 318,
  },
]

export const recentlyPlayedIds = ['gm-002', 'gm-003']

export function lobbyRows(signedIn: boolean): LobbyRow[] {
  const rows: LobbyRow[] = []

  if (signedIn && recentlyPlayedIds.length > 0) {
    rows.push({
      id: 'recently-played',
      title: 'Recently Played',
      category_slug: null,
      game_ids: recentlyPlayedIds,
    })
  }

  for (const category of categories) {
    const ids = games.filter((game) => game.category_slug === category.slug).map((game) => game.id)
    if (ids.length > 0) {
      rows.push({ id: category.slug, title: category.name, category_slug: category.slug, game_ids: ids })
    }
  }

  return rows
}
