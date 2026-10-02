import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

const admin = { status: 200, body: userBody({ role: 'admin', display_name: 'R. Cruz' }) }

describe('the withdrawal queue', () => {
  it('requires a payout reference to mark a request paid and then clears it from the queue', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({ 'GET /me': admin })

    renderApp('/admin/withdrawals')

    const table = await screen.findByRole('table', { name: 'Withdrawal requests' })
    expect(within(table).getByText('Jose Martinez')).toBeInTheDocument()
    expect(within(table).queryByText('PAYOUT-7702')).not.toBeInTheDocument()

    await user.click(within(table).getByRole('button', { name: 'Review' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Withdrawal ₱1,500.00' }))
    expect(dialog.getByText('0917 555 0142')).toBeInTheDocument()

    await user.click(dialog.getByRole('button', { name: 'Mark paid' }))
    expect(dialog.getByRole('alert')).toHaveTextContent('Enter the reference of the transfer you sent.')

    await user.type(dialog.getByLabelText('Payout reference'), 'GC-778812')
    await user.click(dialog.getByRole('button', { name: 'Mark paid' }))

    expect(await screen.findByText('Queue is clear')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
