import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorBody, renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const guest = { status: 401, body: errorBody('Authentication is required') }
const player = { status: 200, body: userBody({ display_name: 'Rico Mercado' }) }
const wallet = { status: 200, body: { currency: 'PHP', balance_minor: 525_000 } }

describe('the top bar for a guest', () => {
  it('shows the wordmark and the two auth actions, and nothing wallet-shaped', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const banner = await screen.findByRole('banner')
    expect(within(banner).getByRole('link', { name: 'HeziBet' })).toHaveAttribute('href', '/')
    expect(within(banner).getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Join now' })).toBeInTheDocument()
    expect(within(banner).queryByRole('link', { name: 'Deposit' })).not.toBeInTheDocument()
    expect(within(banner).queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument()
  })
})

describe('the top bar for a player', () => {
  it('keeps the balance chip and the Deposit button as two separate controls', async () => {
    stubFetchRoutes({ 'GET /me': player, 'GET /wallets/PHP': wallet })

    renderApp('/')

    const banner = await screen.findByRole('banner')
    const balance = await within(banner).findByRole('link', { name: 'Wallet balance ₱5,250.00' })
    const deposit = within(banner).getByRole('link', { name: 'Deposit' })

    expect(balance).toHaveAttribute('href', '/wallet')
    expect(deposit).toHaveAttribute('href', '/wallet/deposit')
    expect(balance).not.toContainElement(deposit)
    expect(deposit).not.toContainElement(balance)
  })

  it('names the account menu by surname and offers Account and Sign out', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player, 'GET /wallets/PHP': wallet })

    renderApp('/')

    const trigger = await screen.findByRole('button', { name: 'Account menu' })
    expect(trigger).toHaveTextContent('RM')
    expect(trigger).toHaveTextContent('Mercado')

    await user.click(trigger)

    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('opens with the chat rail and closes it from the top bar toggle', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player, 'GET /wallets/PHP': wallet })

    renderApp('/')

    const chat = await screen.findByRole('complementary', { name: 'Live chat' })
    expect(await within(chat).findByRole('list', { name: 'Messages' })).toBeInTheDocument()
    expect(within(chat).getByRole('textbox', { name: 'Message' })).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: 'Toggle chat' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(toggle)

    expect(screen.queryByRole('complementary', { name: 'Live chat' })).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('lets a guest read the chat but asks them to sign in before writing', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const chat = await screen.findByRole('complementary', { name: 'Live chat' })
    expect(await within(chat).findByRole('list', { name: 'Messages' })).toBeInTheDocument()
    expect(within(chat).queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()

    await user.click(within(chat).getByRole('button', { name: 'Sign in to chat' }))

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('the navigation rail', () => {
  it('lists the player routes without counts or badges', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    expect(within(rail).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(rail).getByRole('link', { name: 'Games' })).toHaveAttribute('href', '/games')
    expect(within(rail).getByRole('button', { name: 'Wallet' })).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: 'History' })).toBeInTheDocument()

    const originals = await within(rail).findByRole('link', { name: 'Originals' })
    expect(originals).toHaveAttribute('href', '/games?category=originals')
    expect(originals).not.toHaveTextContent(/\d/)
  })
})
