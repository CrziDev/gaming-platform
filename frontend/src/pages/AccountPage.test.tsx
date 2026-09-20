import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

const player = { status: 200, body: userBody() }

async function fillPasswordForm() {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Current password'), 'current-password')
  await user.type(screen.getByLabelText('New password'), 'new-secure-password')
  await user.type(screen.getByLabelText('Confirm new password'), 'new-secure-password')
  return user
}

describe('the account password form', () => {
  it('validates confirmation before sending', async () => {
    const fetchMock = stubFetchRoutes({ 'GET /me': player })
    const user = userEvent.setup()
    renderApp('/account')

    await user.type(await screen.findByLabelText('Current password'), 'current-password')
    await user.type(screen.getByLabelText('New password'), 'new-secure-password')
    await user.type(screen.getByLabelText('Confirm new password'), 'different-password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/both passwords must match/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('places server credential errors beside the current password', async () => {
    stubFetchRoutes({
      'GET /me': player,
      'POST /password': {
        status: 400,
        body: {
          error: 'One or more fields are invalid',
          fields: { current_password: 'Current password is incorrect' },
        },
      },
    })
    renderApp('/account')
    const user = await fillPasswordForm()

    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/current password is incorrect/i)
  })

  it('confirms success, clears the form, and keeps the current session', async () => {
    stubFetchRoutes({
      'GET /me': player,
      'POST /password': { status: 204 },
    })
    renderApp('/account')
    const user = await fillPasswordForm()

    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Password changed.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Current password')).toHaveValue(''))
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument()
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument()
  })

  it('does not show a player status the account response does not own', async () => {
    stubFetchRoutes({ 'GET /me': player })
    renderApp('/account')

    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(screen.queryByText('Status')).not.toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })
})
