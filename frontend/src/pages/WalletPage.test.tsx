import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setActiveCurrency } from '@/features/wallet'
import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
  setActiveCurrency('PHP')
})

const player = { status: 200, body: userBody() }

describe('the wallet page', () => {
  it('switches the active wallet from the sheet and the header follows it', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')

    expect(await screen.findByText('₱5,250.00')).toBeInTheDocument()
    const header = within(await screen.findByRole('banner'))
    expect(header.getByRole('link', { name: 'Wallet balance ₱5,250.00' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Switch currency' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Switch currency' }))
    expect(sheet.getByRole('button', { name: /^PHP/ })).toHaveAttribute('aria-current', 'true')
    await user.click(sheet.getByRole('button', { name: /^USD/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('$142.50')).toBeInTheDocument()
    expect(await header.findByRole('link', { name: 'Wallet balance $142.50' })).toBeInTheDocument()
    expect(screen.queryByText(/nothing converts/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fixed at registration/i)).not.toBeInTheDocument()
  })

  it('lists every open request and opens its status page', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')

    expect(await screen.findByRole('heading', { name: 'Open requests · 2' })).toBeInTheDocument()
    expect(screen.getByText('₱2,500.00 · Method A')).toBeInTheDocument()
    expect(screen.getByText('₱1,000.00 · Method A')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /₱2,500\.00 · Method A/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Request 8850' })).toBeInTheDocument()
  })

  it('offers deposit and cash out side by side, and cash out has no form', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')

    const main = within(await screen.findByRole('main'))
    expect(main.getByRole('link', { name: 'Deposit' })).toBeInTheDocument()
    await user.click(main.getByRole('link', { name: 'Cash out' }))

    expect(await main.findByRole('heading', { level: 1, name: 'Cash out' })).toBeInTheDocument()
    expect(main.getByText(/aren.t open yet/i)).toBeInTheDocument()
    expect(main.queryByRole('textbox')).not.toBeInTheDocument()
    expect(main.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(main.getAllByRole('link', { name: 'Back to wallet' })).toHaveLength(2)
  })

  it('lists every wallet on the account page and offers no unbuilt controls', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/account')

    expect(await screen.findByText('₱5,250.00')).toBeInTheDocument()
    expect(screen.getByText('$142.50')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/nothing converts/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fixed at registration/i)).not.toBeInTheDocument()
  })
})

describe('history', () => {
  it('shows the ledger without a client-computed summary or a dead export button', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/history')

    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
    expect(await screen.findByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Deposited ·/)).not.toBeInTheDocument()
  })

  it('shows paginated round records in the rounds tab', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/history')

    await user.click(await screen.findByRole('tab', { name: 'Rounds' }))
    expect(await screen.findByRole('table', { name: 'Round history' })).toBeInTheDocument()
    expect(screen.getAllByText('Aurora Dice').length).toBeGreaterThan(0)
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
  })
})
