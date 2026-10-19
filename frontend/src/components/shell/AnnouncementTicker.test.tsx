import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes } from '@/test-utils'

afterEach(() => vi.unstubAllGlobals())

const guest = { status: 401, body: { error: 'Authentication is required' } }

describe('the lobby announcement ticker', () => {
  it('presents each active announcement once to assistive technology', async () => {
    stubFetchRoutes({ 'GET /me': guest })
    renderApp('/')

    const region = await screen.findByRole('region', { name: 'Announcements' })
    const items = within(region).getAllByRole('listitem').map((item) => item.textContent)
    expect(items).toEqual(['New games are available in the lobby.', 'Welcome to PLAYMEVO.'])
    expect(region.closest('header')).toBeNull()
    expect(region).toHaveClass('absolute', 'inset-x-0', 'top-0')
    expect(region).toHaveClass('bg-surface-1/20')
    expect(region).not.toHaveClass('rounded-input', 'shadow-sm')
    expect(region.parentElement?.querySelector('main')).not.toBeNull()

    const track = region.querySelector<HTMLElement>('.announcement-track')
    expect(track).toHaveStyle({ '--announcement-duration': '7s' })
  })

  it('does not render outside the lobby', async () => {
    stubFetchRoutes({ 'GET /me': guest })
    renderApp('/games')

    await screen.findByRole('heading', { name: 'Games' })
    expect(screen.queryByRole('region', { name: 'Announcements' })).not.toBeInTheDocument()
  })
})
