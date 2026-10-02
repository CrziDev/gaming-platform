import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { errorBody, liveShellStubs, renderApp, stubFetchRoutes, stubWebSocket, userBody } from '@/test-utils'

vi.mock('@/api/mode', () => ({ testFixturesEnabled: false }))

beforeEach(() => {
  stubWebSocket()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const emptyPage = { rows: [], total: 0, page: 1, size: 20, pages: 1 }

const cashOutStubs = {
  ...liveShellStubs,
  'GET /me': { status: 200, body: userBody() },
  'GET /wallets/PHP': { status: 200, body: { currency: 'PHP', balance_minor: 500_000 } },
  'GET /currencies': {
    status: 200,
    body: [
      {
        code: 'PHP',
        name: 'Philippine Peso',
        symbol: '₱',
        minor_units: 2,
        deposit_min_minor: 10_000,
        deposit_max_minor: 5_000_000,
        withdrawal_min_minor: 10_000,
        withdrawal_max_minor: 5_000_000,
      },
    ],
  },
  'GET /payment-methods': {
    status: 200,
    body: [{ id: 'c4c0d1a2-7f43-4c8e-9a51-0d5f1f6c2b11', name: 'GCash', description: '', pay_to: '', reference_required: true }],
  },
  'GET /withdrawals': { status: 200, body: emptyPage },
}

async function fillAndSubmit() {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Amount'), '1500')
  await user.type(screen.getByLabelText('Account name'), 'Juan Dela Cruz')
  await user.type(screen.getByLabelText('Account number'), '09171234567')
  await user.click(screen.getByRole('button', { name: 'Request withdrawal' }))
}

describe('cashing out against a live server', () => {
  it('shows the server’s field errors against the inputs they name', async () => {
    stubFetchRoutes({
      ...cashOutStubs,
      'POST /withdrawals': {
        status: 400,
        body: errorBody('One or more fields are invalid', { account_number: 'Account number must be between 1 and 64 characters' }),
      },
    })

    renderApp('/wallet/cash-out')
    await fillAndSubmit()

    expect(await screen.findByText('Account number must be between 1 and 64 characters')).toBeInTheDocument()
  })

  it('reads a balance that changed underneath the form as an amount error', async () => {
    stubFetchRoutes({
      ...cashOutStubs,
      'POST /withdrawals': {
        status: 409,
        body: { error: 'Your balance is too low for that withdrawal', code: 'INSUFFICIENT_BALANCE' },
      },
    })

    renderApp('/wallet/cash-out')
    await fillAndSubmit()

    expect(await screen.findByText('This is more than your balance')).toBeInTheDocument()
  })

  it('sends the request once with an idempotency key and no client-chosen identity', async () => {
    const created = {
      id: '9b8f3a10-5c2e-4c1d-8e6f-7a9b0c1d2e3f',
      method_id: 'c4c0d1a2-7f43-4c8e-9a51-0d5f1f6c2b11',
      method_name: 'GCash',
      amount_minor: 150_000,
      currency: 'PHP',
      account_name: 'Juan Dela Cruz',
      account_number: '09171234567',
      status: 'pending',
      payout_reference: null,
      reason: null,
      created_at: '2026-10-02T00:00:00Z',
      reviewed_at: null,
      cancelled_at: null,
    }
    const fetchMock = stubFetchRoutes({
      ...cashOutStubs,
      'POST /withdrawals': { status: 201, body: created },
      [`GET /withdrawals/${created.id}`]: { status: 200, body: created },
    })

    renderApp('/wallet/cash-out')
    await fillAndSubmit()

    expect(await screen.findByRole('heading', { name: 'Awaiting review' })).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post).toBeDefined()
    const init = post![1]!
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.parse(String(init.body))).toEqual({
      method_id: created.method_id,
      currency: 'PHP',
      amount_minor: 150_000,
      account_name: 'Juan Dela Cruz',
      account_number: '09171234567',
    })
  })
})
