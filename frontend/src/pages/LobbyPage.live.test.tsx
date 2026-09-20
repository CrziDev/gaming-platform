import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveShellStubs, renderApp, stubFetchRoutes, stubWebSocket, userBody } from '@/test-utils'

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
})
