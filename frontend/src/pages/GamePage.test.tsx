import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { plinkoManifest } from '@/mocks/plinko'
import { wallets } from '@/mocks/wallet'
import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

const player = { status: 200, body: userBody() }

let startingBalance = 0

beforeEach(() => {
  startingBalance = wallets.find((wallet) => wallet.currency === 'PHP')?.balance_minor ?? 0
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

async function readyBoard() {
  const opened = await openPlinko()
  frameSays(opened.iframe, { v: 1, type: 'ready', game: 'plinko' })
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

function lastDrop(post: ReturnType<typeof vi.spyOn>) {
  const call = [...post.mock.calls].reverse().find((entry) => (entry[0] as { type: string }).type === 'drop')
  return call?.[0] as { round_id: string; slot: number; result_label: string } | undefined
}

describe('a title without an engine', () => {
  it('keeps the display slot and no frame', async () => {
    stubFetchRoutes({ 'GET /me': player })
    renderApp('/game/aurora-dice')

    expect(await screen.findByText('game canvas · aspect-locked slot')).toBeInTheDocument()
    expect(screen.queryByTitle(/game$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Rows' })).not.toBeInTheDocument()
  })
})

describe('the Plinko game page', () => {
  it('embeds the frame and configures the board once it is ready', async () => {
    const { post } = await readyBoard()

    const configure = post.mock.calls.find((entry) => (entry[0] as { type: string }).type === 'configure')?.[0] as {
      rows: number
      risk: string
      multipliers_hundredths: number[]
      sound: boolean
    }
    expect(configure.rows).toBe(8)
    expect(configure.risk).toBe('normal')
    expect(configure.multipliers_hundredths).toEqual(plinkoManifest().multipliers_hundredths['8']?.normal)
    expect(configure.sound).toBe(true)
    expect(screen.queryByRole('status', { name: 'Loading Plinko' })).not.toBeInTheDocument()

    const rows = screen.getByRole('radiogroup', { name: 'Rows' })
    expect(within(rows).getByRole('radio', { name: '8' })).toHaveAttribute('aria-checked', 'true')
    expect(within(screen.getByRole('tablist', { name: 'Risk' })).getByRole('tab', { name: 'Normal' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('reconfigures the board when rows or risk change', async () => {
    const user = userEvent.setup()
    const { post } = await readyBoard()

    await user.click(screen.getByRole('radio', { name: '12' }))
    await user.click(screen.getByRole('tab', { name: 'High' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'configure', rows: 12, risk: 'high' }),
        window.location.origin,
      ),
    )
    const configure = post.mock.calls.at(-1)?.[0] as { multipliers_hundredths: number[] }
    expect(configure.multipliers_hundredths).toHaveLength(13)
  })

  it('settles a round on the server, drops the ball, and reveals the result when it lands', async () => {
    const user = userEvent.setup()
    const { iframe, post } = await readyBoard()

    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))

    await waitFor(() => expect(lastDrop(post)).toBeDefined())
    const drop = lastDrop(post)!
    expect(drop.slot).toBeGreaterThanOrEqual(0)
    expect(drop.slot).toBeLessThanOrEqual(8)
    expect(drop.result_label).toMatch(/^\+₱/)

    // Rows and risk are locked while the ball is falling.
    expect(screen.getByRole('radio', { name: '8' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('locked while a ball falls')).toBeInTheDocument()

    frameSays(iframe, { v: 1, type: 'landed', round_id: drop.round_id, slot: drop.slot })

    await waitFor(() => expect(screen.getByRole('radio', { name: '8' })).not.toHaveAttribute('aria-disabled'))
    const php = wallets.find((wallet) => wallet.currency === 'PHP')!
    expect(php.balance_minor).not.toBe(startingBalance)
  })

  it('shows the bets feed and the game notice, with no activity panel or related row', async () => {
    await readyBoard()
    const feed = screen.getByRole('table', { name: 'Recent bets' })
    expect(within(feed).getAllByRole('row').length).toBeGreaterThan(1)
    expect(screen.getByRole('region', { name: 'Game notice' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'My Activity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Rules' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^More Originals/)).not.toBeInTheDocument()
  })

  it('refreshes the settled truth even when the frame never reports the landing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { post } = await readyBoard()

    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))
    await untilDropped(post)
    expect(screen.getByRole('radio', { name: '8' })).toHaveAttribute('aria-disabled', 'true')

    await vi.advanceTimersByTimeAsync(8_100)

    await waitFor(() => expect(screen.getByRole('radio', { name: '8' })).not.toHaveAttribute('aria-disabled'), {
      timeout: 3000,
    })
  })

  it('treats a second ready as a reloaded frame and reconfigures it', async () => {
    const user = userEvent.setup()
    const { iframe, post } = await readyBoard()

    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))
    await waitFor(() => expect(lastDrop(post)).toBeDefined())
    const before = post.mock.calls.length

    frameSays(iframe, { v: 1, type: 'ready', game: 'plinko' })

    await waitFor(() => expect(screen.getByRole('radio', { name: '8' })).not.toHaveAttribute('aria-disabled'))
    expect(post.mock.calls.slice(before).some((entry) => (entry[0] as { type: string }).type === 'configure')).toBe(true)
  })

  it('refuses a stake the wallet cannot cover and drops nothing', async () => {
    const user = userEvent.setup()
    wallets.find((wallet) => wallet.currency === 'PHP')!.balance_minor = 50
    const { post } = await readyBoard()

    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))

    expect(await screen.findByRole('dialog', { name: 'Not enough balance' })).toBeInTheDocument()
    expect(lastDrop(post)).toBeUndefined()
  })

  it('mutes the game and remembers it', async () => {
    const user = userEvent.setup()
    const { post } = await readyBoard()

    await user.click(screen.getByRole('button', { name: 'Mute game sound' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({ v: 1, type: 'set_sound', enabled: false }, window.location.origin),
    )
    expect(window.localStorage.getItem('game.sound')).toBe('false')
  })

  it('shows the frame as failed when it never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await openPlinko()

    await vi.advanceTimersByTimeAsync(10_100)

    expect(await screen.findByRole('alert')).toHaveTextContent('did not answer')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
