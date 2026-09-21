import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

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

  it('validates the new password before sending it', async () => {
    const fetchMock = stubFetchRoutes({ 'GET /me': guest })
    const user = userEvent.setup()
    renderApp('/reset?token=abc')

    await user.type(await screen.findByLabelText('New password'), 'long-enough-password')
    await user.type(screen.getByLabelText('Confirm password'), 'different-password')
    await user.click(screen.getByRole('button', { name: 'Save password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/both passwords must match/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps invalid-link recovery on the page', async () => {
    stubFetchRoutes({
      'GET /me': guest,
      'POST /password-reset/confirm': {
        status: 400,
        body: { error: 'This reset link is invalid or has expired' },
      },
    })
    const user = userEvent.setup()
    renderApp('/reset?token=expired')

    await user.type(await screen.findByLabelText('New password'), 'long-enough-password')
    await user.type(screen.getByLabelText('Confirm password'), 'long-enough-password')
    await user.click(screen.getByRole('button', { name: 'Save password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i)
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot')
  })

  it('installs the returned session and enters the signed-in application', async () => {
    stubFetchRoutes({
      'GET /me': guest,
      'POST /password-reset/confirm': { status: 200, body: userBody() },
    })
    const user = userEvent.setup()
    renderApp('/reset?token=valid')

    await user.type(await screen.findByLabelText('New password'), 'long-enough-password')
    await user.type(screen.getByLabelText('Confirm password'), 'long-enough-password')
    await user.click(screen.getByRole('button', { name: 'Save password' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Choose a new password' })).not.toBeInTheDocument()
  })
})
