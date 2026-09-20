import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { errorBody, liveShellStubs, renderApp, stubFetchRoutes, stubWebSocket, userBody } from '@/test-utils'

vi.mock('@/api/mode', () => ({ testFixturesEnabled: false }))

beforeEach(() => {
  stubWebSocket()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const game = {
  id: '6d2b3a1e-0c4f-4f7a-9b1e-2a3c4d5e6f70',
  slug: 'plinko',
  name: 'Plinko',
  description: 'Drop a ball through the pegs.',
  category_slug: 'originals',
  category_name: 'Originals',
  provider: 'In-house',
  status: 'active',
  currency: 'PHP',
  min_wager_minor: 100,
  max_wager_minor: 500_000,
  wager_step_minor: 100,
  thumbnail_url: null,
  flags: [],
  created_at: '2026-06-01T00:00:00Z',
}

const page = (rows: unknown[]) => ({ rows, total: rows.length, page: 1, size: 100, pages: 1 })

describe('the lobby against a live server', () => {
  it('shows the signed-in player’s deduplicated recent games', async () => {
    stubFetchRoutes({
      ...liveShellStubs,
      'GET /me': { status: 200, body: userBody() },
      'GET /categories': { status: 200, body: [] },
      'GET /games': { status: 200, body: page([game]) },
      'GET /recent-games': { status: 200, body: page([game]) },
    })

    renderApp('/')

    const recent = await screen.findByRole('list', { name: 'Recently Played' })
    expect(within(recent).getAllByRole('listitem')).toHaveLength(1)
    expect(within(recent).getByRole('link', { name: /Plinko/ })).toHaveAttribute('href', '/game/plinko')
  })

  it('features the first title by name when no playable game is listed', async () => {
    stubFetchRoutes({
      ...liveShellStubs,
      'GET /me': { status: 401, body: errorBody('Authentication is required') },
      'GET /categories': { status: 200, body: [] },
      'GET /games': {
        status: 200,
        body: page([
          { ...game, id: '1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b', slug: 'vault-break', name: 'Vault Break' },
          { ...game, id: '2a3b4c5d-6e7f-4801-9a0b-1c2d3e4f5a6b', slug: 'aurora-dice', name: 'Aurora Dice' },
        ]),
      },
    })

    renderApp('/')

    const hero = (await screen.findByRole('heading', { level: 1, name: 'Vault Break' })).closest('section')!
    expect(hero.querySelector('img')).toBeNull()
  })
})
