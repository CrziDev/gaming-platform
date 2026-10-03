import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatMultiplier } from '@/lib/format'
import { plinkoManifest } from '@/mocks/plinko'
import { rounds, wallets } from '@/mocks/wallet'
import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

const player = { status: 200, body: userBody() }

let startingBalance = 0
let startingRounds = 0

beforeEach(() => {
  startingBalance = wallets.find((wallet) => wallet.currency === 'PHP')?.balance_minor ?? 0
  startingRounds = rounds.length
  try {
    window.localStorage.clear()
  } catch {
    // no site data in this run
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  const php = wallets.find((wallet) => wallet.currency === 'PHP')
  if (php) php.balance_minor = startingBalance
  // A settled fixture round is unshifted to the front; drop what this test added.
  rounds.splice(0, rounds.length - startingRounds)
})

async function openPlinko() {
  stubFetchRoutes({ 'GET /me': player })
  renderApp('/game/plinko')
  const iframe = (await screen.findByTitle('Plinko game')) as HTMLIFrameElement
  const post = vi.spyOn(iframe.contentWindow as Window, 'postMessage')
  return { iframe, post }
}

function frameSays(iframe: HTMLIFrameElement, data: unknown) {
  window.dispatchEvent(
    new MessageEvent('message', { data, origin: window.location.origin, source: iframe.contentWindow }),
  )
}

function useMobileViewport() {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

async function readyBoard() {
  const opened = await openPlinko()
  frameSays(opened.iframe, { v: 3, type: 'ready', game: 'plinko' })
  await waitFor(() => expect(opened.post).toHaveBeenCalledWith(expect.objectContaining({ type: 'configure' }), window.location.origin))
  return opened
}

// Under fake timers the mock request and React Query both wait on the clock,
// so a drop is awaited by advancing it in small steps rather than by polling.
async function untilDropped(post: ReturnType<typeof vi.spyOn>) {
  for (let step = 0; step < 40 && !lastDrop(post); step++) {
    await vi.advanceTimersByTimeAsync(100)
  }
  expect(lastDrop(post)).toBeDefined()
}

function riskButton() {
  return screen.getByRole('button', { name: /10 rows ·/ })
}

function lastDrop(post: ReturnType<typeof vi.spyOn>) {
  const call = [...post.mock.calls].reverse().find((entry) => (entry[0] as { type: string }).type === 'drop')
  return call?.[0] as { round_id: string; slot: number; result_label: string } | undefined
}

describe('a title without an engine', () => {
  it('keeps the display slot and no frame, and still shows the history under it', async () => {
    stubFetchRoutes({ 'GET /me': player })
    renderApp('/game/aurora-dice')

    expect(await screen.findByRole('region', { name: 'Aurora Dice game' })).toBeInTheDocument()
    expect(screen.queryByTitle(/game$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /rows ·/ })).not.toBeInTheDocument()

    const history = await screen.findByRole('table', { name: 'History' })
    expect(within(history).getAllByRole('row').length).toBeGreaterThan(1)
    expect(within(history).queryAllByRole('cell', { name: /Aurora/ })).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'See all history' })).toHaveAttribute('href', '/history')
  })
})

describe('the Plinko game page', () => {
  it('embeds the frame and configures the ten-row board once it is ready', async () => {
    const { post } = await readyBoard()

    const configure = post.mock.calls.find((entry) => (entry[0] as { type: string }).type === 'configure')?.[0] as {
      rows: number
      risk: string
      multipliers_hundredths: number[]
      sound: boolean
    }
    expect(configure.rows).toBe(10)
    expect(configure.risk).toBe('normal')
    expect(configure.multipliers_hundredths).toEqual(plinkoManifest().multipliers_hundredths['10']?.normal)
    expect(configure.sound).toBe(true)
    expect(screen.queryByRole('status', { name: 'Loading Plinko' })).not.toBeInTheDocument()
    expect(riskButton()).toHaveTextContent('10 rows · Normal')
  })

  it('tells the frame where the board sits once it is ready', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('aria-label') === 'Plinko game') return new DOMRect(0, 72, 390, 772)
      if (this.tagName === 'HEADER') return new DOMRect(18, 84, 354, 44)
      if (this.querySelector(':scope > [aria-label="Bet controls"]')) return new DOMRect(18, 585, 354, 180)
      return new DOMRect(0, 168, 390, 413)
    })
    const { post } = await readyBoard()

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        {
          v: 3,
          type: 'layout',
          x: 0,
          y: 96,
          width: 390,
          height: 413,
          controls: [
            { x: 18, y: 12, width: 354, height: 44 },
            { x: 18, y: 513, width: 354, height: 180 },
          ],
        },
        window.location.origin,
      ),
    )
  })

  it('keeps the top bar on a phone and gives the game the bottom nav\'s place', async () => {
    useMobileViewport()
    await readyBoard()

    expect(screen.getByRole('link', { name: /Wallet balance/ })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument()
    const controls = screen.getByRole('region', { name: 'Bet controls' })
    expect(within(controls).getByRole('button', { name: /PLACE BET/ })).toBeEnabled()
  })

  it('reconfigures the board when the risk changes', async () => {
    const user = userEvent.setup()
    const { post } = await readyBoard()

    await user.click(riskButton())
    const menu = screen.getByRole('menu', { name: 'Risk' })
    expect(within(menu).getByRole('menuitemradio', { name: /Normal/ })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(menu).getByRole('menuitemradio', { name: /High/ }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'configure',
          rows: 10,
          risk: 'high',
          multipliers_hundredths: plinkoManifest().multipliers_hundredths['10']?.high,
        }),
        window.location.origin,
      ),
    )
    expect(riskButton()).toHaveTextContent('10 rows · High')
    expect(window.localStorage.getItem('game.plinko.risk')).toBe('high')
  })

  it('walks the stake along a ladder of stakes the server accepts', async () => {
    const user = userEvent.setup()
    await readyBoard()
    const controls = screen.getByRole('region', { name: 'Bet controls' })

    expect(within(controls).getByText('₱1.00')).toBeInTheDocument()
    await user.click(within(controls).getByRole('button', { name: 'Increase bet' }))
    expect(within(controls).getByText('₱2.00')).toBeInTheDocument()
    await user.click(within(controls).getByRole('button', { name: 'Increase bet' }))
    expect(within(controls).getByText('₱5.00')).toBeInTheDocument()
    await user.click(within(controls).getByRole('button', { name: 'Decrease bet' }))
    expect(within(controls).getByText('₱2.00')).toBeInTheDocument()
  })

  it('settles a round on the server, drops the ball, and reveals the result when it lands', async () => {
    const user = userEvent.setup()
    const { iframe, post } = await readyBoard()

    await user.click(screen.getByRole('button', { name: /PLACE BET/ }))

    await waitFor(() => expect(lastDrop(post)).toBeDefined())
    const drop = lastDrop(post)!
    expect(drop.slot).toBeGreaterThanOrEqual(0)
    expect(drop.slot).toBeLessThanOrEqual(10)
    expect(drop.result_label).toMatch(/^\+₱/)

    // The risk is locked while the ball is falling.
    expect(riskButton()).toBeDisabled()

    frameSays(iframe, { v: 3, type: 'landed', round_id: drop.round_id, slot: drop.slot })

    await waitFor(() => expect(riskButton()).toBeEnabled())
    const php = wallets.find((wallet) => wallet.currency === 'PHP')!
    expect(php.balance_minor).not.toBe(startingBalance)
  })

  it('places a bet with the space bar', async () => {
    const user = userEvent.setup()
    const { post } = await readyBoard()

    await user.keyboard(' ')

    await waitFor(() => expect(lastDrop(post)).toBeDefined())
  })

  it('accepts only one bet until its ball lands, including clicks before React rerenders', async () => {
    const { iframe, post } = await readyBoard()
    const before = rounds.length
    const placeBet = screen.getByRole('button', { name: /PLACE BET/ })

    act(() => {
      placeBet.click()
      placeBet.click()
      placeBet.click()
    })

    expect(placeBet).toBeDisabled()
    await waitFor(() => expect(lastDrop(post)).toBeDefined())
    expect(rounds).toHaveLength(before + 1)
    expect(placeBet).toBeDisabled()

    const drop = lastDrop(post)!
    frameSays(iframe, { v: 3, type: 'landed', round_id: drop.round_id, slot: drop.slot })

    await waitFor(() => expect(placeBet).toBeEnabled())
  })

  it('shows, once a round has landed, that round in the history', async () => {
    const user = userEvent.setup()
    const { iframe, post } = await readyBoard()

    // No fixture round belongs to Plinko, so the feed only says where bets will go.
    expect(await screen.findByText('Your bets on this game will appear here.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'History' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /PLACE BET/ }))
    await waitFor(() => expect(lastDrop(post)).toBeDefined())
    const drop = lastDrop(post)!
    frameSays(iframe, { v: 3, type: 'landed', round_id: drop.round_id, slot: drop.slot })

    const feed = await screen.findByRole('table', { name: 'History' })
    const settled = rounds.find((round) => round.id === drop.round_id)!
    expect(within(feed).getAllByRole('row')).toHaveLength(2)
    expect(within(feed).getByText(formatMultiplier(settled.multiplier_hundredths!))).toBeInTheDocument()
    expect(within(feed).queryByRole('columnheader', { name: 'Player' })).not.toBeInTheDocument()
  })

  it('refreshes the settled truth even when the frame never reports the landing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { post } = await readyBoard()

    await user.click(screen.getByRole('button', { name: /PLACE BET/ }))
    await untilDropped(post)
    expect(riskButton()).toBeDisabled()

    await vi.advanceTimersByTimeAsync(8_100)

    await waitFor(() => expect(riskButton()).toBeEnabled(), { timeout: 3000 })
    expect(screen.getByRole('button', { name: /PLACE BET/ })).toBeEnabled()
  })

  it('treats a second ready as a reloaded frame and reconfigures it', async () => {
    const user = userEvent.setup()
    const { iframe, post } = await readyBoard()

    await user.click(screen.getByRole('button', { name: /PLACE BET/ }))
    await waitFor(() => expect(lastDrop(post)).toBeDefined())
    const before = post.mock.calls.length

    frameSays(iframe, { v: 3, type: 'ready', game: 'plinko' })

    await waitFor(() => expect(riskButton()).toBeEnabled())
    expect(post.mock.calls.slice(before).some((entry) => (entry[0] as { type: string }).type === 'configure')).toBe(true)
  })

  it('refuses a stake the wallet cannot cover and drops nothing', async () => {
    const user = userEvent.setup()
    wallets.find((wallet) => wallet.currency === 'PHP')!.balance_minor = 50
    const { post } = await readyBoard()

    await user.click(screen.getByRole('button', { name: /PLACE BET/ }))

    expect(await screen.findByRole('dialog', { name: 'Not enough balance' })).toBeInTheDocument()
    expect(lastDrop(post)).toBeUndefined()
  })

  it('shows the payouts of the board in play and no return', async () => {
    const user = userEvent.setup()
    await readyBoard()

    await user.click(screen.getByRole('button', { name: 'Fair game' }))

    const dialog = screen.getByRole('dialog', { name: 'Fair game' })
    expect(within(dialog).queryByText('95.00%')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/return to player/i)).not.toBeInTheDocument()
    expect(within(dialog).getByText('Payouts · 10 rows · Normal')).toBeInTheDocument()
    expect(within(dialog).getAllByText(formatMultiplier(1000))).toHaveLength(2)
  })

  it('mutes the game and remembers it', async () => {
    const user = userEvent.setup()
    const { post } = await readyBoard()

    await user.click(screen.getByRole('button', { name: 'Mute game sound' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({ v: 3, type: 'set_sound', enabled: false }, window.location.origin),
    )
    expect(window.localStorage.getItem('game.sound')).toBe('false')
  })

  it('shows the frame as failed when it never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await openPlinko()

    await vi.advanceTimersByTimeAsync(10_100)

    expect(await screen.findByRole('alert')).toHaveTextContent('too long to respond')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
