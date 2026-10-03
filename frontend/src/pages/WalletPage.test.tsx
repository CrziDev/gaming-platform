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

    const main = within(await screen.findByRole('main'))
    expect(await main.findByText('₱5,250.00')).toBeInTheDocument()
    const header = within(await screen.findByRole('banner'))
    expect(header.getByRole('link', { name: 'Wallet balance ₱5,250.00' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /PHP|USD/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Switch currency' }))
    const sheet = within(await screen.findByRole('dialog', { name: 'Switch currency' }))
    expect(sheet.getByRole('button', { name: /^PHP/ })).toHaveAttribute('aria-current', 'true')
    await user.click(sheet.getByRole('button', { name: /^USD/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await main.findByText('$142.50')).toBeInTheDocument()
    expect(await header.findByRole('link', { name: 'Wallet balance $142.50' })).toBeInTheDocument()
    expect(screen.queryByText(/nothing converts/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fixed at registration/i)).not.toBeInTheDocument()
  })

  it('opens on activity and lists every deposit request in its tab', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')

    expect(await screen.findByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('tab', { name: /^Deposits\s*2$/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Withdrawals\s*1$/ })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /^Deposits\s*2$/ }))
    const deposits = within(screen.getByRole('table', { name: 'Deposit requests' }))
    expect(deposits.getAllByText('pending')).toHaveLength(2)
    expect(deposits.getByText('approved')).toBeInTheDocument()
    expect(deposits.getByText('rejected')).toBeInTheDocument()
    expect(screen.getByText('Funds are added once a request is approved.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /₱2,500\.00 · Method A.*Ref 8850/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Request 8850' })).toBeInTheDocument()
  })

  it('opens a pending withdrawal from its tab', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')

    await user.click(await screen.findByRole('tab', { name: /^Withdrawals/ }))
    await user.click(await screen.findByRole('button', { name: /\$50\.00 · Method A/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Withdrawal' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Awaiting review' })).toBeInTheDocument()
  })

  it('offers deposit and cash out under the balance', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')

    const main = within(await screen.findByRole('main'))
    expect(main.getByRole('link', { name: 'Deposit' })).toBeInTheDocument()
    await user.click(main.getByRole('link', { name: 'Cash out' }))

    expect(await main.findByRole('heading', { level: 1, name: 'Cash out' })).toBeInTheDocument()
    expect(await main.findByLabelText('Account number')).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Request withdrawal' })).toBeInTheDocument()
  })

  it('lists every wallet on the account page and exposes only the built security control', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/account')

    expect(await screen.findByText('₱5,250.00')).toBeInTheDocument()
    expect(screen.getByText('$142.50')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument()
    expect(screen.queryByText(/nothing converts/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fixed at registration/i)).not.toBeInTheDocument()
  })
})

describe('history', () => {
  it('shows the ledger with a server-reported summary per currency and no export button', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/history')

    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
    expect(await screen.findByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument()

    const php = await screen.findByRole('region', { name: 'PHP summary' })
    expect(within(php).getByText('Deposited')).toBeInTheDocument()
    expect(within(php).getByText('₱6,500.00')).toBeInTheDocument()
    expect(within(php).getByText('₱3,240.00')).toBeInTheDocument()
    expect(within(php).getByText('₱2,990.00')).toBeInTheDocument()
    const usd = screen.getByRole('region', { name: 'USD summary' })
    expect(within(usd).getByText('$200.00')).toBeInTheDocument()
    expect(screen.queryByText(/₱6,700/)).not.toBeInTheDocument()
  })

  it('leaves the range to the picker rather than repeating it on each figure', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/history')

    await screen.findByRole('region', { name: 'PHP summary' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Date range' }), '7')
    expect(screen.getByRole('combobox', { name: 'Date range' })).toHaveValue('7')
    expect(await screen.findAllByText('Deposited')).toHaveLength(2)
    expect(screen.queryByText(/· 7d/)).not.toBeInTheDocument()
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
