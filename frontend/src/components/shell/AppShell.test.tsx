import { screen, waitFor, within } from '@testing-library/react'
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

  it('lights the bell for an unread notification and clears it on Mark all read', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player, 'GET /wallets/PHP': wallet })

    renderApp('/')

    const bell = await screen.findByRole('button', { name: 'Notifications' })
    await user.click(bell)

    const panel = screen.getByRole('list', { name: 'Notifications' })
    const approved = await within(panel).findByText(/Deposit approved/)
    expect(approved).toHaveTextContent('+₱2,000.00')
    expect(within(panel).getByText(/Deposit rejected/)).toHaveTextContent('₱1,000.00 — Reference not found')
    expect(within(panel).getByText(/Deposit rejected/)).not.toHaveTextContent('+₱1,000.00')
    expect(within(panel).getByText(/Big win/)).toHaveTextContent('+₱500.00')
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Mark all read' }))
    await within(panel).findByText(/Deposit approved/)
    expect(screen.queryByText('Nothing yet')).not.toBeInTheDocument()
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
  it('rests collapsed and expands only while the player is interacting with it', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': guest })
    window.localStorage.setItem('shell.rail', 'expanded')

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    expect(rail).toHaveClass('w-14')

    await user.hover(rail)
    expect(rail).toHaveClass('w-48')

    await user.unhover(rail)
    expect(rail).toHaveClass('w-14')
  })

  it('lists Games, Hot, New, Favorites and Promotions in that order with nothing else', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    const items = within(rail).getAllByRole('listitem').map((item) => item.textContent?.trim())
    expect(items).toEqual(['Games', 'Hot', 'New', 'Favorites', 'Promotions'])

    expect(within(rail).getByRole('link', { name: 'Games' })).toHaveAttribute('href', '/games')
    expect(within(rail).getByRole('link', { name: 'Hot' })).toHaveAttribute('href', '/games/hot')
    expect(within(rail).getByRole('link', { name: 'New' })).toHaveAttribute('href', '/games/new')
    expect(within(rail).getByRole('link', { name: 'Promotions' })).toHaveAttribute('href', '/promotions')
    expect(within(rail).getByRole('button', { name: 'Favorites' })).toBeInTheDocument()
    expect(within(rail).getByRole('searchbox', { name: 'Search games' })).toBeInTheDocument()
    expect(within(rail).queryByRole('list', { name: 'Search results' })).not.toBeInTheDocument()
  })

  it('asks a guest to sign in before opening Favorites', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    await user.click(within(rail).getByRole('button', { name: 'Favorites' }))

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('keeps Wallet and History reachable from the account menu', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'Account menu' }))

    expect(screen.getByRole('link', { name: 'Wallet' })).toHaveAttribute('href', '/wallet')
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('href', '/history')
  })
})

describe('Support and English', () => {
  it('answer a tap in the rail with a Future development notice that Escape dismisses', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    const support = within(rail).getByRole('button', { name: 'Support' })
    const english = within(rail).getByRole('button', { name: 'English' })
    expect(within(rail).queryByText(/future development/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await user.click(support)
    expect(support).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Future development')
    expect(rail).not.toContainElement(screen.getByRole('tooltip'))

    await user.keyboard('{Escape}')
    expect(support).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

    await user.click(english)
    expect(english).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Future development')
  })

  it('close the notice on a tap elsewhere and on their own after a moment', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    const support = within(rail).getByRole('button', { name: 'Support' })

    await user.click(support)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await user.click(screen.getByRole('main'))
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

    await user.click(support)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(), { timeout: 3500 })
    expect(support).toHaveAttribute('aria-expanded', 'false')
  })

  it('answer a tap in the drawer the same way', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': guest })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))

    renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'Toggle navigation' }))
    const rail = screen.getByRole('complementary', { name: 'Main navigation' })
    const support = screen.getAllByRole('button', { name: 'Support' }).find((button) => !rail.contains(button))!
    expect(support).toBeInTheDocument()

    await user.click(support)
    expect(support).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Future development')
  })
})

describe('searching from the rail', () => {
  const navLabels = ['Games', 'Hot', 'New', 'Favorites', 'Promotions']

  it('lists matching games above the navigation while the box has text', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    await user.type(within(rail).getByRole('searchbox', { name: 'Search games' }), 'plink')

    const results = await within(rail).findByRole('list', { name: 'Search results' })
    expect(within(results).getAllByRole('listitem')).toHaveLength(1)
    expect(within(results).getByRole('link', { name: /Plinko/ })).toHaveAttribute(
      'href',
      '/game/plinko',
    )
    expect(within(rail).getByRole('link', { name: 'See all results' })).toHaveAttribute(
      'href',
      '/games?q=plink',
    )

    const nav = within(rail).getByRole('navigation')
    expect(results.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(nav).getAllByRole('listitem').map((item) => item.textContent?.trim())).toEqual(
      navLabels,
    )
  })

  it('asks a guest to sign in before opening a result', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    await user.type(within(rail).getByRole('searchbox', { name: 'Search games' }), 'plink')

    const results = await within(rail).findByRole('list', { name: 'Search results' })
    await user.click(within(results).getByRole('button', { name: /Plinko/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Sign in to play' })
    expect(dialog).toHaveTextContent('straight to Plinko')
  })

  it('drops the results and restores the navigation when the box is cleared', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    const box = within(rail).getByRole('searchbox', { name: 'Search games' })
    await user.type(box, 'plink')
    await within(rail).findByRole('list', { name: 'Search results' })

    await user.click(within(rail).getByRole('button', { name: 'Clear search' }))

    expect(box).toHaveValue('')
    expect(within(rail).queryByRole('list', { name: 'Search results' })).not.toBeInTheDocument()
    expect(within(rail).getAllByRole('listitem').map((item) => item.textContent?.trim())).toEqual(
      navLabels,
    )
  })

  it('keeps the results after opening a game from them', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player, 'GET /wallets/PHP': wallet })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    const box = within(rail).getByRole('searchbox', { name: 'Search games' })
    await user.type(box, 'plink')
    const results = await within(rail).findByRole('list', { name: 'Search results' })

    await user.click(within(results).getByRole('link', { name: /Plinko/ }))

    expect(await screen.findByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Plinko')
    expect(box).toHaveValue('plink')
    expect(within(rail).getByRole('list', { name: 'Search results' })).toBeInTheDocument()
  })

  it('says when nothing matches', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    await user.type(within(rail).getByRole('searchbox', { name: 'Search games' }), 'zzz')

    expect(await within(rail).findByText('No games match')).toBeInTheDocument()
    expect(within(rail).queryByRole('list', { name: 'Search results' })).not.toBeInTheDocument()
  })

  it('hands the search off to the catalogue on Enter', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    await user.type(within(rail).getByRole('searchbox', { name: 'Search games' }), 'crash{Enter}')

    const main = screen.getByRole('main')
    expect(await within(main).findByRole('button', { name: /Clear search/ })).toBeInTheDocument()
  })

  it('focuses the box on ⌘K', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))

    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Main navigation' })
    await user.keyboard('{Meta>}k{/Meta}')

    expect(within(rail).getByRole('searchbox', { name: 'Search games' })).toHaveFocus()
  })
})
