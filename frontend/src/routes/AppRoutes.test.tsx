import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorBody, renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

const signedOut = { status: 401, body: errorBody('Authentication is required') }
const signedIn = { status: 200, body: userBody() }
const signedInAdmin = { status: 200, body: userBody({ role: 'admin', display_name: 'R. Cruz' }) }

describe('the public lobby', () => {
  it('holds the app back until the session is known', async () => {
    stubFetchRoutes({ 'GET /me': signedOut })

    renderApp('/')

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /browse all games/i })).toBeInTheDocument()
  })

  it('lets a guest browse without a wall, offering sign in and join', async () => {
    stubFetchRoutes({ 'GET /me': signedOut })

    renderApp('/')

    const header = within(await screen.findByRole('banner'))
    expect(await header.findByRole('button', { name: 'Join now' })).toBeInTheDocument()
    expect(header.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('opens the auth modal over the lobby for a /register deep link', async () => {
    stubFetchRoutes({ 'GET /me': signedOut })

    renderApp('/register')

    expect(await screen.findByRole('dialog', { name: 'Join now' })).toBeInTheDocument()
    expect(screen.getByLabelText('Account currency')).toBeInTheDocument()
  })
})

describe('routes that need a session', () => {
  it('sends a signed-out visitor back to the lobby with the auth modal raised', async () => {
    stubFetchRoutes({ 'GET /me': signedOut })

    renderApp('/wallet')

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Wallet' })).not.toBeInTheDocument()
  })

  it('renders the wallet for a signed-in player', async () => {
    stubFetchRoutes({ 'GET /me': signedIn })

    renderApp('/wallet')

    expect(await screen.findByRole('heading', { name: 'Wallet' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('the operations console', () => {
  it('refuses a player and sends them to the staff sign-in page', async () => {
    stubFetchRoutes({ 'GET /me': signedIn })

    renderApp('/admin')

    expect(await screen.findByRole('heading', { name: 'Operations console' })).toBeInTheDocument()
    expect(screen.getByLabelText('Authenticator code')).toBeInTheDocument()
  })

  it('refuses a signed-out visitor the same way', async () => {
    stubFetchRoutes({ 'GET /me': signedOut })

    renderApp('/admin/users')

    expect(await screen.findByRole('heading', { name: 'Operations console' })).toBeInTheDocument()
  })

  it('lets an admin through to the console', async () => {
    stubFetchRoutes({ 'GET /me': signedInAdmin })

    renderApp('/admin')

    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Console navigation' })).toBeInTheDocument(),
    )
  })

  it('sends an admin who is already signed in straight to the dashboard', async () => {
    stubFetchRoutes({ 'GET /me': signedInAdmin })

    renderApp('/admin/login')

    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })
})
