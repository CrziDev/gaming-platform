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

  it('shows one row per category with that category’s games', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const originals = await screen.findByRole('list', { name: 'Originals' })
    expect(within(originals).getAllByRole('listitem')).toHaveLength(2)

    const crash = screen.getByRole('list', { name: 'Crash' })
    expect(within(crash).getAllByRole('listitem')).toHaveLength(1)

    expect(screen.queryByRole('list', { name: 'Recently Played' })).not.toBeInTheDocument()
  })

  it('raises the sign-in dialog when a guest picks a game', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const originals = await screen.findByRole('list', { name: 'Originals' })
    await user.click(within(originals).getByRole('button', { name: /Vault Break/ }))

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
  })
})
