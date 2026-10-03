import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Plinko RTP configuration', () => {
  it('inspects profiles and boards without changing the active RTP', async () => {
    const user = userEvent.setup()
    stubFetchRoutes({
      'GET /me': { status: 200, body: userBody({ role: 'admin', display_name: 'R. Cruz' }) },
    })

    renderApp('/admin/rtp/gm-004')

    expect(await screen.findByRole('heading', { name: 'Plinko configuration' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Current RTP' })).toHaveTextContent('Playing at 95.00%')
    expect(screen.getAllByText('Viewing does not change the active RTP.', { selector: 'p' })).not.toHaveLength(0)

    const summaryHeading = await screen.findByRole('heading', { name: 'Summary' })
    const summary = within(summaryHeading.closest('section')!)
    expect(summary.getByText('plinko/9500')).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Chance distribution by landing slot' })).toBeInTheDocument()

    const outcomes = within(screen.getByRole('heading', { name: 'Slot outcomes' }).closest('section')!)
    expect(outcomes.getByText('Slot 0')).toBeInTheDocument()
    expect(outcomes.getAllByText('0.303%')).toHaveLength(2)
    expect(outcomes.getByText('100.000%')).toBeInTheDocument()
    expect(outcomes.getAllByText('10×')).not.toHaveLength(0)
    expect(outcomes.getAllByText('2.5×')).not.toHaveLength(0)
    expect(outcomes.queryAllByText('1×')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: '105.00%' }))
    expect(await screen.findByText('plinko/10500')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Current RTP' })).toHaveTextContent('Playing at 95.00%')

    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: 'High' }))
    expect(await screen.findByText('10 slots')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'High' })).toHaveAttribute('aria-pressed', 'true')
  })
})
