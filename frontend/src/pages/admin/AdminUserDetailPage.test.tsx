import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('admin user details', () => {
  it('shows separate wallets, omits unsupported controls, and changes account status', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({
      'GET /me': {
        status: 200,
        body: userBody({ role: 'admin', display_name: 'R. Cruz' }),
      },
    })

    renderApp('/admin/users/us-0001')

    expect(await screen.findByText('PHP wallet')).toBeInTheDocument()
    expect(screen.getByText('USD wallet')).toBeInTheDocument()

    const main = within(screen.getByRole('main'))
    expect(main.queryByRole('tab', { name: 'Rounds' })).not.toBeInTheDocument()
    expect(main.queryByRole('tab', { name: 'Sessions' })).not.toBeInTheDocument()
    expect(main.queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument()

    await user.click(main.getByRole('button', { name: 'Suspend account' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Suspend this account?' }))
    await user.click(dialog.getByRole('button', { name: 'Suspend' }))

    expect(await main.findByRole('button', { name: 'Reinstate account' })).toBeInTheDocument()
  })
})
