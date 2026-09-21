import type { Category, Game } from '@/api/types'

import { daysAgo } from './clock'

export const categories: Category[] = [
  { slug: 'originals', name: 'Originals', game_count: 3, available: true },
  { slug: 'crash', name: 'Crash', game_count: 1, available: true },
  { slug: 'slots', name: 'Slots', game_count: 0, available: false },
  { slug: 'live', name: 'Live dealers', game_count: 0, available: false },
]

export const games: Game[] = [
  {
    id: 'gm-001',
    slug: 'aurora-dice',
    name: 'Aurora Dice',
    description: 'Roll over or under a target you choose and set your own odds.',
    category_slug: 'originals',
    category_name: 'Originals',
    provider: 'In-house',
    status: 'active',
    wager_limits: {
      PHP: { min_wager_minor: 100, max_wager_minor: 500_000, wager_step_minor: 100 },
      USD: { min_wager_minor: 100, max_wager_minor: 500_000, wager_step_minor: 100 },
    },
    thumbnail_url: null,
    created_at: daysAgo(120),
    flags: ['hot'],
  },
  {
    id: 'gm-002',
    slug: 'vault-break',
    name: 'Vault Break',
    description: 'Crack the combination one dial at a time and stop before the alarm.',
    category_slug: 'originals',
    category_name: 'Originals',
    provider: 'In-house',
    status: 'active',
    wager_limits: {
      PHP: { min_wager_minor: 100, max_wager_minor: 500_000, wager_step_minor: 100 },
      USD: { min_wager_minor: 100, max_wager_minor: 500_000, wager_step_minor: 100 },
    },
    thumbnail_url: null,
    created_at: daysAgo(4),
    flags: ['hot', 'new'],
  },
  {
    id: 'gm-003',
    slug: 'skyline-crash',
    name: 'Skyline Crash',
    description: 'The multiplier climbs until it crashes. Cash out first.',
    category_slug: 'crash',
    category_name: 'Crash',
    provider: 'In-house',
    status: 'active',
    wager_limits: {
      PHP: { min_wager_minor: 100, max_wager_minor: 500_000, wager_step_minor: 100 },
      USD: { min_wager_minor: 100, max_wager_minor: 500_000, wager_step_minor: 100 },
    },
    thumbnail_url: null,
    created_at: daysAgo(9),
    flags: ['new'],
  },
  {
    id: 'gm-004',
    slug: 'plinko',
    name: 'Plinko',
    description: 'Drop a ball through eight to sixteen rows of pegs and land a multiplier.',
    category_slug: 'originals',
    category_name: 'Originals',
    provider: 'In-house',
    status: 'active',
    wager_limits: {
      PHP: { min_wager_minor: 100, max_wager_minor: 1_000_000, wager_step_minor: 100 },
      USD: { min_wager_minor: 100, max_wager_minor: 1_000_000, wager_step_minor: 100 },
    },
    thumbnail_url: null,
    created_at: daysAgo(40),
    flags: [],
  },
]

export const recentlyPlayedIds = ['gm-002', 'gm-003']

export const favoriteIds = new Set<string>(['gm-001'])
