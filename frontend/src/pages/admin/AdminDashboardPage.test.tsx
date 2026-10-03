import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('admin dashboard', () => {
  it('reads hold against the stake-weighted expected return and breaks the day down per game', async () => {
    stubFetchRoutes({
      'GET /me': { status: 200, body: userBody({ role: 'admin', display_name: 'R. Cruz' }) },
    })

    renderApp('/admin')

    const hold = (await screen.findByText('Hold today')).closest('div')!
    expect(within(hold).getByText('₱7,410')).toBeInTheDocument()
    expect(within(hold).getByText('RTP 92.33% · expected 95.33%')).toBeInTheDocument()
    expect(screen.queryByText(/target/)).not.toBeInTheDocument()
    expect(screen.queryByText('Returned today')).not.toBeInTheDocument()

    const table = within(await screen.findByRole('table', { name: 'Game activity today' }))
    const rows = table.getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getByRole('link').textContent)).toEqual([
      'Plinko',
      'Aurora Dice',
      'Vault Break',
    ])
    expect(table.getByRole('link', { name: 'Plinko' })).toHaveAttribute('href', '/admin/games/gm-004')

    const aurora = within(rows[1]!)
    expect(aurora.getByText('−₱1,700')).toBeInTheDocument()
    expect(aurora.getByText('105.24%')).toBeInTheDocument()
    expect(aurora.getByText('expected 96.00%')).toBeInTheDocument()
  })

  it('names who did what in the activity log, with the detail beneath', async () => {
    stubFetchRoutes({
      'GET /me': { status: 200, body: userBody({ role: 'admin', display_name: 'R. Cruz' }) },
    })

    renderApp('/admin')

    const heading = await screen.findByRole('heading', { name: 'Activity log' })
    const log = within(heading.closest('section')!)
    expect(await log.findByText('deposit.approve')).toBeInTheDocument()
    expect(log.getAllByText('R. Cruz').length).toBeGreaterThan(0)
    expect(log.getByText('Approved 8837 · +₱1,500.00 to mlopez')).toBeInTheDocument()
  })
})
