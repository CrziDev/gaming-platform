import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => vi.unstubAllGlobals())

describe('admin announcements', () => {
  it('creates, edits, disables, and re-enables a permanent announcement', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({
      'GET /me': { status: 200, body: userBody({ role: 'admin', display_name: 'R. Cruz' }) },
    })
    renderApp('/admin/announcements')

    const table = within(await screen.findByRole('table', { name: 'Announcements' }))
    await user.click(screen.getByRole('button', { name: 'New announcement' }))
    const createDialog = within(screen.getByRole('dialog', { name: 'New announcement' }))
    await user.type(createDialog.getByLabelText('Announcement text'), 'Maintenance starts tonight.')
    expect(createDialog.getByLabelText('Permanent')).toBeChecked()
    await user.click(createDialog.getByRole('button', { name: 'Publish' }))

    const createdText = await table.findByText('Maintenance starts tonight.')
    const row = createdText.closest('tr')
    expect(row).not.toBeNull()
    await user.click(within(row!).getByRole('button', { name: 'Edit' }))

    const editDialog = within(screen.getByRole('dialog', { name: 'Edit announcement' }))
    const text = editDialog.getByLabelText('Announcement text')
    await user.clear(text)
    await user.type(text, 'Maintenance has been rescheduled.')
    await user.click(editDialog.getByRole('button', { name: 'Save changes' }))

    const editedText = await table.findByText('Maintenance has been rescheduled.')
    const editedRow = editedText.closest('tr')
    expect(editedRow).not.toBeNull()
    await user.click(within(editedRow!).getByRole('button', { name: 'Disable' }))
    expect(await within(editedRow!).findByText('inactive')).toBeInTheDocument()
    await user.click(within(editedRow!).getByRole('button', { name: 'Enable' }))
    expect(await within(editedRow!).findByText('active')).toBeInTheDocument()
  })
})
