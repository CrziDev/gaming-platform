import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameHost, type GameFrame } from './GameHost'
import { SoundToggle } from './SoundToggle'

function frame(overrides: Partial<GameFrame> = {}): GameFrame {
  return {
    url: '/games/plinko/index.html',
    key: 0,
    status: 'loading',
    onRetry: vi.fn(),
    ...overrides,
  }
}

describe('GameHost', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the named placeholder when there is no frame', () => {
    render(<GameHost name="Aurora Dice" />)
    expect(screen.getByRole('region', { name: 'Aurora Dice game' })).toHaveTextContent('Aurora Dice')
    expect(screen.queryByTitle('Aurora Dice game')).not.toBeInTheDocument()
  })

  it('embeds the game page behind its controls and says it is loading', () => {
    render(<GameHost name="Plinko" frame={frame()} />)
    const iframe = screen.getByTitle('Plinko game')
    expect(iframe).toHaveAttribute('src', '/games/plinko/index.html')
    expect(iframe).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('status', { name: 'Loading Plinko' })).toHaveTextContent('LOADING BOARD')
  })

  it('uncovers the board once it is ready', () => {
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

  it('titles the game and lays the platform controls over the frame', () => {
    render(
      <GameHost
        name="Plinko"
        subtitle="RISK · PLAY · WIN"
        frame={frame({ status: 'ready' })}
        actions={<SoundToggle on onChange={() => {}} />}
        controls={<button type="button">PLACE BET</button>}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Plinko' })).toBeInTheDocument()
    expect(screen.getByText('RISK · PLAY · WIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mute game sound' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'PLACE BET' })).toBeInTheDocument()
  })

  it('sets a game\'s own title mark in place of the platform\'s title', () => {
    render(
      <GameHost
        name="Plinko Tropical"
        subtitle="RISK · PLAY · WIN"
        frame={frame({ status: 'ready' })}
        titleMark={<h1 aria-label="Plinko Tropical">PLINKO</h1>}
      />,
    )
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Plinko Tropical' })).toHaveTextContent('PLINKO')
    expect(screen.queryByText('RISK · PLAY · WIN')).not.toBeInTheDocument()
  })

  it('tucks the stage under the title row by the title\'s overlap', () => {
    const { rerender } = render(<GameHost name="Plinko" frame={frame({ status: 'ready' })} />)
    const stageBox = () => screen.getByTitle('Plinko game').parentElement?.querySelector<HTMLElement>('[style*="--stage-top"]')
    expect(stageBox()?.style.getPropertyValue('--stage-top')).toBe('0.375rem')
    rerender(<GameHost name="Plinko" frame={frame({ status: 'ready' })} titleOverlap={30} />)
    expect(stageBox()?.style.getPropertyValue('--stage-top')).toBe('-30px')
  })

  it('reports the stage and the rects its controls cover, relative to the zone', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('aria-label') === 'Plinko game') return new DOMRect(56, 72, 1180, 489)
      if (this.tagName === 'HEADER') return new DOMRect(688, 88, 340, 98)
      if (this.querySelector(':scope > button')) return new DOMRect(688, 250, 340, 295)
      return new DOMRect(256, 88, 408, 457)
    })
    const onStage = vi.fn()
    render(
      <GameHost
        name="Plinko"
        frame={frame({ status: 'ready' })}
        onStage={onStage}
        actions={<SoundToggle on onChange={() => {}} />}
        controls={<button type="button">PLACE BET</button>}
      />,
    )
    expect(onStage).toHaveBeenLastCalledWith({
      x: 200,
      y: 16,
      width: 408,
      height: 457,
      controls: [
        { x: 632, y: 16, width: 340, height: 98 },
        { x: 632, y: 178, width: 340, height: 295 },
      ],
    })
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
