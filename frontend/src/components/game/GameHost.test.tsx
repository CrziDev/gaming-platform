import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GameHost, type GameFrame } from './GameHost'
import { SoundToggle } from './SoundToggle'

function frame(overrides: Partial<GameFrame> = {}): GameFrame {
  return {
    url: '/games/plinko/index.html',
    key: 0,
    status: 'loading',
    onRetry: vi.fn(),
    aspect: 'portrait',
    ...overrides,
  }
}

describe('GameHost', () => {
  it('shows the named placeholder when there is no frame', () => {
    render(<GameHost name="Aurora Dice" />)
    expect(screen.getByRole('region', { name: 'Aurora Dice game canvas' })).toHaveTextContent('Aurora Dice')
    expect(screen.queryByTitle('Aurora Dice game')).not.toBeInTheDocument()
  })

  it('embeds the game page and covers it while it loads', () => {
    render(<GameHost name="Plinko" frame={frame()} />)
    const iframe = screen.getByTitle('Plinko game')
    expect(iframe).toHaveAttribute('src', '/games/plinko/index.html')
    expect(screen.getByRole('status', { name: 'Loading Plinko' })).toBeInTheDocument()
  })

  it('uncovers the frame once it is ready', () => {
    render(<GameHost name="Plinko" frame={frame({ status: 'ready' })} />)
    expect(screen.getByTitle('Plinko game')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('reports a frame that never answered and offers a retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<GameHost name="Plinko" frame={frame({ status: 'error', error: 'No answer', onRetry })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No answer')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders platform chrome over the frame', () => {
    render(<GameHost name="Plinko" frame={frame({ status: 'ready' })} chrome={<SoundToggle on onChange={() => {}} />} />)
    expect(screen.getByRole('button', { name: 'Mute game sound' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SoundToggle', () => {
  it('flips the preference', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SoundToggle on={false} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Unmute game sound' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
