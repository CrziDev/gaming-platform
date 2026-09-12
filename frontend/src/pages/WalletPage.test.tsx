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
  it('switches the active wallet and the header follows it', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')

    expect(await screen.findByText('₱5,250.00')).toBeInTheDocument()
    const header = within(await screen.findByRole('banner'))
    expect(header.getByRole('link', { name: 'Wallet balance ₱5,250.00' })).toBeInTheDocument()

    const tabs = within(screen.getByRole('tablist', { name: 'Switch wallet' }))
    await user.click(tabs.getByRole('tab', { name: 'USD' }))

    expect(await screen.findByText('$142.50')).toBeInTheDocument()
    expect(await header.findByRole('link', { name: 'Wallet balance $142.50' })).toBeInTheDocument()
    expect(screen.queryByText(/fixed at registration/i)).not.toBeInTheDocument()
  })

  it('lists every wallet on the account page and offers no unbuilt controls', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/account')

    expect(await screen.findByText('₱5,250.00')).toBeInTheDocument()
    expect(screen.getByText('$142.50')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument()
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
})
