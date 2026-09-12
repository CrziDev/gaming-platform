import type { BigWin, Category, Game, LobbyRow, Promotion } from '@/api/types'

import { minutesAgo } from './clock'

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
    flags: ['hot'],
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
    flags: ['hot', 'new'],
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
    flags: ['new'],
  },
]

export const recentlyPlayedIds = ['gm-002', 'gm-003']

export const favoriteIds = new Set<string>(['gm-001'])

export function lobbyRows(signedIn: boolean): LobbyRow[] {
  if (!signedIn || recentlyPlayedIds.length === 0) {
    return []
  }
  return [
    {
      id: 'recently-played',
      title: 'Recently Played',
      category_slug: null,
      game_ids: recentlyPlayedIds,
    },
  ]
}

const win = (
  id: string,
  username: string,
  game_slug: string,
  amount_minor: number,
  minutes: number,
): BigWin => ({ id, username, game_slug, amount_minor, currency: 'PHP', created_at: minutesAgo(minutes) })

export const bigWins: BigWin[] = [
  win('bw-1', 'jack_jones', 'aurora-dice', 4_860_000, 2),
  win('bw-2', 'mariacruz', 'skyline-crash', 3_124_000, 5),
  win('bw-3', 'benj_04', 'vault-break', 2_791_500, 9),
  win('bw-4', 'reyesph', 'aurora-dice', 2_248_000, 14),
  win('bw-5', 'nina.dlc', 'skyline-crash', 1_933_000, 21),
  win('bw-6', 'k1ngoff', 'vault-break', 1_672_000, 30),
  win('bw-7', 'sadbetsonly', 'aurora-dice', 1_405_000, 44),
  win('bw-8', 'gregor56', 'skyline-crash', 1_188_000, 58),
]

export const promotions: Promotion[] = [
  { id: 'pr-1', kicker: 'Weekly', title: '15% cashback every Monday', subtitle: 'On net losses, no wagering' },
  { id: 'pr-2', kicker: 'Tournament', title: '₱250K slots race', subtitle: 'Top 100 players share the pot' },
  { id: 'pr-3', kicker: 'VIP', title: 'Daily rakeback', subtitle: 'Unlocks at Bronze III' },
]
