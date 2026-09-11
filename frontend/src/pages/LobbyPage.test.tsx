import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorBody, renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

const guest = { status: 401, body: errorBody('Authentication is required') }
const player = { status: 200, body: userBody() }

describe('the lobby for a guest', () => {
  it('merchandises the featured game with its minimum bet and both calls to action', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Aurora Dice' })).toBeInTheDocument()
    expect(screen.getByText('Featured')).toBeInTheDocument()
    expect(screen.getByText('₱1.00')).toBeInTheDocument()

    const hero = screen.getByRole('heading', { level: 1, name: 'Aurora Dice' }).closest('section')!
    expect(within(hero).getByRole('button', { name: 'Join now' })).toBeInTheDocument()
    expect(within(hero).getByRole('link', { name: 'Browse all games' })).toBeInTheDocument()
  })

  it('composes banner, big wins, category grid and promotions in that order', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const wins = await screen.findByRole('list', { name: 'Big wins' })
    const grid = await screen.findByRole('list', { name: 'All games' })
    const promotions = await screen.findByRole('list', { name: 'Promotions' })
    const banner = screen.getByRole('heading', { level: 1, name: 'Aurora Dice' })

    expect(banner.compareDocumentPosition(wins) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(wins.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(grid.compareDocumentPosition(promotions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(within(wins).getAllByRole('listitem')).toHaveLength(8)
    expect(within(wins).getByRole('link', { name: 'jack_jones won ₱48,600.00' })).toHaveAttribute(
      'href',
      '/game/aurora-dice',
    )
    expect(within(promotions).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('list', { name: 'Recently Played' })).not.toBeInTheDocument()
  })

  it('filters the grid by category tab and keeps See all pointed at the same filter', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const all = await screen.findByRole('list', { name: 'All games' })
    expect(within(all).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/games')

    const tabs = screen.getByRole('tablist', { name: 'Browse by category' })
    await user.click(within(tabs).getByRole('tab', { name: 'Crash' }))

    const crash = await screen.findByRole('list', { name: 'Crash' })
    expect(within(crash).getAllByRole('listitem')).toHaveLength(1)
    expect(within(tabs).getByRole('tab', { name: 'Crash' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/games?category=crash')
  })

  it('raises the sign-in dialog when a guest picks a game', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const all = await screen.findByRole('list', { name: 'All games' })
    await user.click(within(all).getByRole('button', { name: /Vault Break/ }))

    expect(await screen.findByRole('dialog', { name: 'Sign in to play' })).toBeInTheDocument()
    expect(screen.getByText(/Vault Break is waiting/)).toBeInTheDocument()
  })
})

describe('the lobby for a player', () => {
  it('offers to play the featured game and adds the recently played row', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/')

    expect(await screen.findByRole('link', { name: 'Play Aurora Dice' })).toBeInTheDocument()

    const recent = await screen.findByRole('list', { name: 'Recently Played' })
    expect(within(recent).getAllByRole('listitem')).toHaveLength(2)
    expect(within(recent).getByRole('link', { name: /Skyline Crash/ })).toHaveAttribute(
      'href',
      '/game/skyline-crash',
    )
  })
})
