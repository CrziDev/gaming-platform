import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorBody, renderApp, stubFetchRoutes } from '@/test-utils'

vi.mock('@/api/mode', () => ({ usingMockApi: false, usingFixtures: false }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const guest = { status: 401, body: errorBody('Authentication is required') }

const game = {
  id: '6d2b3a1e-0c4f-4f7a-9b1e-2a3c4d5e6f70',
  slug: 'aurora-dice',
  name: 'Aurora Dice',
  description: 'Roll over or under a target you choose and set your own odds.',
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

describe('the catalogue against a live server', () => {
  it('renders the cards the server returns', async () => {
    stubFetchRoutes({
      'GET /me': guest,
      'GET /categories': { status: 200, body: [] },
      'GET /games': { status: 200, body: page([game]) },
    })

    renderApp('/games')

    const grid = await screen.findByRole('list', { name: 'Game catalogue' })
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1)
    expect(within(grid).getByText('Aurora Dice')).toBeInTheDocument()
    expect(within(grid).getByText('In-house')).toBeInTheDocument()
  })

  it('reports a failed read instead of an empty catalogue', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({
      'GET /me': guest,
      'GET /categories': { status: 200, body: [] },
      'GET /games': [
        { status: 404, body: errorBody('No resource matches that path') },
        { status: 200, body: page([game]) },
      ],
    })

    renderApp('/games')

    expect(await screen.findByRole('alert')).toHaveTextContent('No resource matches that path')
    expect(screen.queryByText('No games match')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    const grid = await screen.findByRole('list', { name: 'Game catalogue' })
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1)
  })
})
