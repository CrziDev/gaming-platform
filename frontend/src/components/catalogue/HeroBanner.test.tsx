import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Game } from '@/api/types'
import { BANNER_ROTATION_MS, HeroBanner } from '@/components/catalogue/HeroBanner'
import { games } from '@/mocks/games'
import { errorBody, renderWithProviders, stubFetchRoutes } from '@/test-utils'

const plinko = games.find((game) => game.slug === 'plinko')!
const billiards: Game = { ...plinko, id: 'gm-005', slug: 'plinko-billiards', name: 'Plinko Billiards' }

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function shownTitle() {
  return screen.getByRole('heading', { level: 1 }).textContent
}

beforeEach(() => {
  vi.useFakeTimers()
  stubFetchRoutes({ 'GET /me': { status: 401, body: errorBody('Authentication is required') } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('HeroBanner', () => {
  it('shows a single title without rotation controls', () => {
    stubReducedMotion(false)
    renderWithProviders(<HeroBanner featured={[plinko]} />)

    expect(shownTitle()).toBe('Plinko')
    expect(screen.queryByRole('button', { name: /show plinko/i })).not.toBeInTheDocument()
  })

  it('moves to the next title every five seconds and wraps around', () => {
    stubReducedMotion(false)
    renderWithProviders(<HeroBanner featured={[plinko, billiards]} />)

    expect(shownTitle()).toBe('Plinko')
    act(() => vi.advanceTimersByTime(BANNER_ROTATION_MS - 1))
    expect(shownTitle()).toBe('Plinko')
    act(() => vi.advanceTimersByTime(1))
    expect(shownTitle()).toBe('Plinko Billiards')
    act(() => vi.advanceTimersByTime(BANNER_ROTATION_MS))
    expect(shownTitle()).toBe('Plinko')
  })

  it('holds while the pointer rests on the banner and resumes when it leaves', () => {
    stubReducedMotion(false)
    renderWithProviders(<HeroBanner featured={[plinko, billiards]} />)

    const banner = screen.getByRole('region', { name: 'Featured games' })
    fireEvent.pointerEnter(banner, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(BANNER_ROTATION_MS * 3))
    expect(shownTitle()).toBe('Plinko')

    fireEvent.pointerLeave(banner, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(BANNER_ROTATION_MS))
    expect(shownTitle()).toBe('Plinko Billiards')
  })

  it('holds while focus is inside the banner', () => {
    stubReducedMotion(false)
    renderWithProviders(<HeroBanner featured={[plinko, billiards]} />)

    fireEvent.focus(screen.getByRole('link', { name: 'Browse all games' }))
    act(() => vi.advanceTimersByTime(BANNER_ROTATION_MS * 2))
    expect(shownTitle()).toBe('Plinko')
  })

  it('shows the title an indicator names and hides the others from assistive technology', () => {
    stubReducedMotion(false)
    renderWithProviders(<HeroBanner featured={[plinko, billiards]} />)

    const pick = screen.getByRole('button', { name: 'Show Plinko Billiards' })
    fireEvent.click(pick)
    expect(shownTitle()).toBe('Plinko Billiards')
    expect(pick).toHaveAttribute('aria-current', 'true')

    const slides = screen.getAllByRole('group', { hidden: true })
    expect(slides[0]).toHaveAttribute('aria-hidden', 'true')
    expect(within(slides[1]!).getByRole('heading', { level: 1 })).toHaveTextContent('Plinko Billiards')
  })

  it('does not rotate under reduced motion, but the indicators still switch', () => {
    stubReducedMotion(true)
    renderWithProviders(<HeroBanner featured={[plinko, billiards]} />)

    act(() => vi.advanceTimersByTime(BANNER_ROTATION_MS * 3))
    expect(shownTitle()).toBe('Plinko')

    fireEvent.click(screen.getByRole('button', { name: 'Show Plinko Billiards' }))
    expect(shownTitle()).toBe('Plinko Billiards')
  })
})
