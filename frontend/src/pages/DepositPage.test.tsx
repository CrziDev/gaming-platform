import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

const player = { status: 200, body: userBody() }

async function submitARequest() {
  const user = userEvent.setup()

  stubFetchRoutes({ 'GET /me': player })
  renderApp('/wallet/deposit')

  // A single enabled method auto-selects and collapses step 1 to a summary row.
  await screen.findByText('Method A')

  const amount = screen.getByLabelText('Amount')
  await user.clear(amount)
  await user.type(amount, '1000')

  await user.type(screen.getByLabelText('Reference'), '8841')

  const proof = document.querySelector<HTMLInputElement>('input[type="file"]')!
  await user.upload(proof, new File(['proof'], 'receipt.png', { type: 'image/png' }))

  await user.click(screen.getByRole('button', { name: 'Submit request' }))

  return user
}

describe('submitting a deposit request', () => {
  it('confirms the request in a toast that names the reference', async () => {
    await submitARequest()

    expect(await screen.findByText(/Request 8841 sent for review/i)).toBeInTheDocument()
  })

  it('never claims the money has landed', async () => {
    await submitARequest()

    const toast = await screen.findByText(/Request 8841 sent for review/i)
    expect(toast).toHaveTextContent(/Funds appear once an admin approves/i)
    expect(toast).not.toHaveTextContent(/added to your balance|credited|deposit complete/i)
  })

  it('lands on the request status page, awaiting approval', async () => {
    await submitARequest()

    expect(await screen.findByText('Awaiting approval')).toBeInTheDocument()
  })
})
