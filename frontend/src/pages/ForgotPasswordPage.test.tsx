import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

const guest = { status: 401, body: { error: 'Authentication is required' } }

describe('the forgot password page', () => {
  it('shows the same successful recovery state after an accepted request', async () => {
    stubFetchRoutes({
      'GET /me': guest,
      'POST /password-reset': { status: 204 },
    })
    const user = userEvent.setup()
    renderApp('/forgot')

    await user.type(await screen.findByLabelText('Email'), 'player@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText(/if that address has an account/i)).toBeInTheDocument()
  })

  it('explains when reset delivery is explicitly unavailable', async () => {
    stubFetchRoutes({
      'GET /me': guest,
      'POST /password-reset': {
        status: 503,
        body: { error: 'Password reset is unavailable right now' },
      },
    })
    const user = userEvent.setup()
    renderApp('/forgot')

    await user.type(await screen.findByLabelText('Email'), 'player@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable right now/i)
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument()
  })
})
