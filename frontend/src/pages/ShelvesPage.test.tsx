import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorBody, renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

const guest = { status: 401, body: errorBody('Authentication is required') }
const player = { status: 200, body: userBody() }

describe('the Hot and New shelves', () => {
  it('shows only games carrying the hot flag', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/games/hot')

    const grid = await screen.findByRole('list', { name: 'Hot games' })
    const names = within(grid)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(names).toHaveLength(2)
    expect(names.join(' ')).toMatch(/Aurora Dice/)
    expect(names.join(' ')).toMatch(/Vault Break/)
    expect(names.join(' ')).not.toMatch(/Skyline Crash/)
  })

  it('shows only games carrying the new flag', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/games/new')

    const grid = await screen.findByRole('list', { name: 'New games' })
    const names = within(grid)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(names).toHaveLength(2)
    expect(names.join(' ')).not.toMatch(/Aurora Dice/)
  })
})

describe('favorites', () => {
  it('lists the favorited games for a player and toggles from the game page', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/favorites')

    const grid = await screen.findByRole('list', { name: 'Favorites' })
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1)
    expect(within(grid).getByRole('link', { name: /Aurora Dice/ })).toBeInTheDocument()

    await user.click(within(grid).getByRole('link', { name: /Aurora Dice/ }))

    const remove = await screen.findByRole('button', { name: 'Remove from favorites' })
    expect(remove).toHaveAttribute('aria-pressed', 'true')
    await user.click(remove)

    const add = await screen.findByRole('button', { name: 'Add to favorites' })
    expect(add).toHaveAttribute('aria-pressed', 'false')
    await user.click(add)

    expect(await screen.findByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument()
  })
})

describe('promotions', () => {
  it('lists every running promotion on its own page', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/promotions')

    expect(await screen.findByRole('heading', { level: 1, name: 'Promotions' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Promotions' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })
})
