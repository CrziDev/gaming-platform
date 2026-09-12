import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

const guest = { status: 401, body: { error: 'Authentication is required' } }

describe('the reset password page', () => {
  it('refuses to pretend without a token in the link', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/reset')

    expect(await screen.findByRole('alert')).toHaveTextContent(/reset link is incomplete/i)
    expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled()
  })

  it('enables saving when the link carries a token', async () => {
    stubFetchRoutes({ 'GET /me': guest })

    renderApp('/reset?token=abc')

    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save password' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
