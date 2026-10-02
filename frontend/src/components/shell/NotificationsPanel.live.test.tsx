import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders, stubFetchRoutes } from '@/test-utils'

import { NotificationsPanel } from './NotificationsPanel'

vi.mock('@/api/mode', () => ({ testFixturesEnabled: false }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const page = (rows: unknown[]) => ({ rows, total: rows.length, page: 1, size: 20, pages: 1 })

describe('withdrawal notifications', () => {
  it('reads a payout plainly and a rejection as money returned, with its reason', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({
      'GET /notifications': {
        status: 200,
        body: page([
          {
            id: 'n-2',
            kind: 'withdrawal_rejected',
            amount_minor: 150_000,
            currency: 'PHP',
            detail: 'Account name does not match',
            reference_id: 'wd-2',
            read: false,
            created_at: '2026-10-02T00:00:00Z',
          },
          {
            id: 'n-1',
            kind: 'withdrawal_approved',
            amount_minor: 80_000,
            currency: 'PHP',
            detail: null,
            reference_id: 'wd-1',
            read: true,
            created_at: '2026-10-01T00:00:00Z',
          },
        ]),
      },
    })

    renderWithProviders(<NotificationsPanel />)

    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    const items = within(screen.getByRole('list', { name: 'Notifications' }))
    expect(await items.findByText(/Withdrawal rejected/)).toHaveTextContent(
      'Withdrawal rejected — +₱1,500.00 — Account name does not match',
    )
    expect(items.getByText(/Withdrawal paid out/)).toHaveTextContent(/^Withdrawal paid out — ₱800\.00$/)
  })
})
