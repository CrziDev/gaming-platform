import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { StatCard } from './StatCard'

describe('HelpTip', () => {
  it('opens on hover and can be pinned for touch interaction', async () => {
    const user = userEvent.setup()
    render(<StatCard label="Hold today" value="₱7,410" help="Stake minus wins paid out." />)

    const trigger = screen.getByRole('button', { name: 'About Hold today' })
    const tip = screen.getByRole('tooltip')

    expect(trigger).toHaveAttribute('aria-controls', tip.id)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(tip).toHaveClass('opacity-0')

    await user.hover(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(tip).toHaveClass('opacity-100')

    await user.unhover(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    await user.unhover(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(tip).toHaveClass('opacity-0')
  })

  it('opens for keyboard focus', async () => {
    const user = userEvent.setup()
    render(<StatCard label="Staked today" value="PHP 20,000" help="Settled rounds only." />)

    await user.tab()

    expect(screen.getByRole('button', { name: 'About Staked today' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('tooltip')).toHaveClass('opacity-100')
  })
})
