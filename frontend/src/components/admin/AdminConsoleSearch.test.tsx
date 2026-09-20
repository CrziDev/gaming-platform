import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => vi.unstubAllGlobals())

function renderConsole() {
  stubFetchRoutes({
    'GET /me': { status: 200, body: userBody({ role: 'admin', display_name: 'R. Cruz' }) },
  })
  return renderApp('/admin/settings')
}

describe('console search', () => {
  it('groups player results and opens the selected account', async () => {
    const user = userEvent.setup()
    renderConsole()

    const search = await screen.findByRole('combobox', { name: 'Search the console' })
    await user.type(search, 'jmart')

    expect(await screen.findByText('Players')).toBeInTheDocument()
    await user.click(screen.getAllByRole('option', { name: /jmartinez/i })[0]!)

    expect(await screen.findByText('PHP wallet')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens an all-status deposit result by its stored record id', async () => {
    const user = userEvent.setup()
    renderConsole()

    await user.type(await screen.findByRole('combobox', { name: 'Search the console' }), '8841')
    expect(await screen.findByText('Payment references')).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Ref 8841/i }))

    expect(await screen.findByText('Console search result across every deposit status.')).toBeInTheDocument()
    expect(await screen.findByText('8841')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
  })

  it('opens a round result outside the default date window', async () => {
    const user = userEvent.setup()
    renderConsole()

    await user.type(await screen.findByRole('combobox', { name: 'Search the console' }), '41-209')
    expect(await screen.findByText('Rounds')).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Round 41-209/i }))

    expect(await screen.findByText('Console search result across all round history.')).toBeInTheDocument()
    expect(screen.getByText('41-209')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
  })
})
