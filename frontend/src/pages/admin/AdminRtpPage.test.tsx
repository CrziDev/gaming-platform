import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('admin RTP', () => {
  it('lists one row per game with options and switches a return after a confirmation', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({
      'GET /me': { status: 200, body: userBody({ role: 'admin', display_name: 'R. Cruz' }) },
    })

    renderApp('/admin/rtp')

    const table = within(await screen.findByRole('table', { name: 'RTP by game' }))
    expect(table.getAllByRole('row')).toHaveLength(3)
    expect(table.getByRole('link', { name: 'Plinko' })).toBeInTheDocument()
    expect(table.getByRole('link', { name: 'Aurora Dice' })).toBeInTheDocument()
    expect(table.queryByRole('link', { name: 'Vault Break' })).not.toBeInTheDocument()

    const plinko = within(table.getByRole('link', { name: 'Plinko' }).closest('tr')!)
    expect(plinko.getByRole('link', { name: 'View details →' })).toHaveAttribute('href', '/admin/rtp/gm-004')
    expect(plinko.getByText('95.00%', { selector: 'span' })).toBeInTheDocument()
    const activate = plinko.getByRole('button', { name: 'Activate' })
    expect(activate).toBeDisabled()

    await user.selectOptions(plinko.getByRole('combobox', { name: 'RTP for Plinko' }), '10500')
    await user.click(activate)
    const above = within(screen.getByRole('dialog', { name: 'Switch Plinko to 105.00%?' }))
    expect(above.getByText('Above 100% the house pays out more than it takes in on average.')).toBeInTheDocument()
    await user.click(above.getByRole('button', { name: 'Switch to 105.00%' }))

    expect(await plinko.findByText('105.00%', { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.selectOptions(plinko.getByRole('combobox', { name: 'RTP for Plinko' }), '9000')
    await user.click(plinko.getByRole('button', { name: 'Activate' }))
    const below = within(screen.getByRole('dialog', { name: 'Switch Plinko to 90.00%?' }))
    expect(below.queryByText(/Above 100%/)).not.toBeInTheDocument()
    await user.click(below.getByRole('button', { name: 'Switch to 90.00%' }))

    expect(await plinko.findByText('90.00%', { selector: 'span' })).toBeInTheDocument()
  })
})
