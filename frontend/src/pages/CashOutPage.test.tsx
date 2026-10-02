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

describe('cashing out', () => {
  it('points to the pending request instead of offering a second one', async () => {
    setActiveCurrency('USD')
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet/cash-out')

    const main = within(await screen.findByRole('main'))
    expect(await main.findByRole('heading', { name: 'A withdrawal is waiting for review' })).toBeInTheDocument()
    expect(main.getByRole('link', { name: 'View request' })).toHaveAttribute('href', '/wallet/cash-out/wd-5120')
    expect(main.queryByRole('button', { name: 'Request withdrawal' })).not.toBeInTheDocument()
  })

  it('checks the amount against the balance and asks for the account', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet/cash-out')

    await user.type(await screen.findByLabelText('Amount'), '6000')
    await user.click(screen.getByRole('button', { name: 'Request withdrawal' }))

    expect(await screen.findByText('This is more than your balance')).toBeInTheDocument()
    expect(screen.getByText('Enter the account name')).toBeInTheDocument()
    expect(screen.getByText('Enter the account number')).toBeInTheDocument()
  })

  it('submits a request, shows it held, and cancels it', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet/cash-out')

    await user.type(await screen.findByLabelText('Amount'), '1500')
    await user.type(screen.getByLabelText('Account name'), 'Juan Dela Cruz')
    await user.type(screen.getByLabelText('Account number'), '0917 123 4567')
    await user.click(screen.getByRole('button', { name: 'Request withdrawal' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Withdrawal' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Awaiting review' })).toBeInTheDocument()
    expect(screen.getByText('₱1,500.00')).toBeInTheDocument()
    expect(screen.getByText('0917 123 4567')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel request' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Cancel this withdrawal?' }))
    await user.click(dialog.getByRole('button', { name: 'Cancel withdrawal' }))

    expect(await screen.findByRole('heading', { name: 'Cancelled' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument()
  })
})
