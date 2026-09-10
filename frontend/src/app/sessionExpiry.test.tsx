import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSessionExpired, noteSession, reportSessionExpired } from '@/features/auth/expiry'
import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

const player = { status: 200, body: userBody() }

beforeEach(() => {
  clearSessionExpired()
})

afterEach(() => {
  clearSessionExpired()
  vi.unstubAllGlobals()
})

describe('a session that ends without the player asking', () => {
  it('stays quiet while the session is live', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')

    expect(await screen.findByText('Available balance · PHP')).toBeInTheDocument()
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument()
  })

  it('raises the dialog when the server stops recognising the session', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')
    await screen.findByText('Available balance · PHP')

    act(() => reportSessionExpired())

    expect(await screen.findByText('Session expired')).toBeInTheDocument()
    expect(
      screen.getByText(/balance and any pending deposit are untouched/i),
    ).toBeInTheDocument()
  })

  it('offers to keep browsing, and leaves the lobby usable', async () => {
    stubFetchRoutes({ 'GET /me': player })
    const user = userEvent.setup()

    renderApp('/wallet')
    await screen.findByText('Available balance · PHP')

    act(() => reportSessionExpired())
    await screen.findByText('Session expired')

    await user.click(screen.getByRole('button', { name: 'Keep browsing' }))

    await waitFor(() => expect(screen.queryByText('Session expired')).not.toBeInTheDocument())
  })

  it('shows one dialog, never the sign-in modal stacked behind it', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')
    await screen.findByText('Available balance · PHP')

    act(() => reportSessionExpired())
    await screen.findByText('Session expired')

    expect(screen.queryByRole('button', { name: 'Join now' })).not.toBeInTheDocument()
  })
})

describe('the session transition that raises it', () => {
  it('treats a live session going missing as an expiry', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')
    await screen.findByText('Available balance · PHP')

    act(() => noteSession(null))

    expect(await screen.findByText('Session expired')).toBeInTheDocument()
  })

  it('does not fire when no session existed in the first place', async () => {
    stubFetchRoutes({ 'GET /me': { status: 200, body: null } })

    renderApp('/')

    await screen.findByText(/browse all games/i)
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument()
  })

  it('does not fire when the player signs out deliberately', async () => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp('/wallet')
    await screen.findByText('Available balance · PHP')

    // useLogout clears the flag before it empties the session cache.
    act(() => {
      clearSessionExpired()
      noteSession(null)
    })

    expect(screen.queryByText('Session expired')).not.toBeInTheDocument()
  })
})
