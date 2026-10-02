import { screen, within } from '@testing-library/react'
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
  it('keeps the selected method and amount visible in the deposit summary', async () => {
    const user = userEvent.setup()

    stubFetchRoutes({ 'GET /me': player })
    renderApp('/wallet/deposit')

    const summary = await screen.findByRole('complementary', { name: 'Deposit summary' }, { timeout: 3000 })
    expect(within(summary).getByText('Method A')).toBeInTheDocument()
    expect(within(summary).getByText('₱1,000.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '2,500' }))

    expect(within(summary).getByText('₱2,500.00')).toBeInTheDocument()
  })

  it('confirms the request in a toast that names the reference', async () => {
    await submitARequest()

    expect(await screen.findByText(/Request 8841 submitted/i)).toBeInTheDocument()
  })

  it('never claims the money has landed', async () => {
    await submitARequest()

    const toast = await screen.findByText(/Request 8841 submitted/i)
    expect(toast).toHaveTextContent(/Funds are added once it is approved/i)
    expect(toast).not.toHaveTextContent(/added to your balance|credited|deposit complete/i)
  })

  it('lands on the request status page, awaiting approval', async () => {
    await submitARequest()

    expect(await screen.findByText('Awaiting approval', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel request/i })).not.toBeInTheDocument()
    expect(screen.getByText(/request can’t be cancelled/i)).toBeInTheDocument()
  })
})
