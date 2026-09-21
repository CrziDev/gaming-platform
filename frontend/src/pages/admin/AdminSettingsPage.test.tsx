import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => vi.unstubAllGlobals())

function renderSettings() {
  stubFetchRoutes({
    'GET /me': { status: 200, body: userBody({ role: 'admin', display_name: 'R. Cruz' }) },
  })
  return renderApp('/admin/settings')
}

describe('admin settings', () => {
  it('creates and disables database-backed payment methods', async () => {
    const user = userEvent.setup()
    renderSettings()

    const table = within(await screen.findByRole('table', { name: 'Payment methods' }))
    expect(table.getByText('Method A')).toBeInTheDocument()
    expect(table.getByText('Method B')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add method' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Add payment method' }))
    await user.type(dialog.getByLabelText('Name'), 'Bank transfer')
    await user.type(dialog.getByLabelText('Description'), 'Send a transfer from your bank.')
    await user.type(dialog.getByLabelText('Pay-to details'), 'Account 123')
    await user.click(dialog.getByLabelText(/Enabled for deposits/))
    await user.click(dialog.getByRole('button', { name: 'Add method' }))

    expect(await table.findByText('Bank transfer')).toBeInTheDocument()

    const methodRow = table.getByText('Method A').closest('tr')!
    await user.click(within(methodRow).getByRole('button', { name: 'Disable' }))
    expect(await within(methodRow).findByText('Off')).toBeInTheDocument()
  })

  it('marks unsupported settings without showing inert controls', async () => {
    const user = userEvent.setup()
    renderSettings()

    await screen.findByRole('heading', { name: 'Settings' })
    for (const tab of ['Staff', 'Limits', 'Platform']) {
      await user.click(screen.getByRole('tab', { name: tab }))
      expect(screen.getByText('Future development')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: /invite|save/i })).not.toBeInTheDocument()
  })
})
