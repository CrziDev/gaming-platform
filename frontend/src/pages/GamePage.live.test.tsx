import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlayRoundResponse, PlinkoManifest, Round } from '@/api/types'
import { games } from '@/mocks/games'
import { plinkoManifest } from '@/mocks/plinko'
import { setActiveCurrency } from '@/features/wallet'
import { liveShellStubs, renderApp, stubFetchRoutes, stubWebSocket, userBody, type StubResponse } from '@/test-utils'

vi.mock('@/api/mode', () => ({ testFixturesEnabled: false }))

beforeEach(() => {
  stubWebSocket()
  setActiveCurrency('PHP')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const plinko = games.find((game) => game.slug === 'plinko')!

const page = {
  ...liveShellStubs,
  'GET /me': { status: 200, body: userBody() },
  'GET /games/plinko': { status: 200, body: plinko },
  'GET /games': { status: 200, body: { rows: [plinko], total: 1, page: 1, size: 100, pages: 1 } },
  'GET /wallets/PHP': { status: 200, body: { currency: 'PHP', balance_minor: 100_000 } },
  'GET /rounds': { status: 200, body: { rows: [], total: 0, page: 1, size: 20, pages: 1 } },
  'GET /favorites': { status: 200, body: { rows: [], total: 0, page: 1, size: 100, pages: 1 } },
} satisfies Record<string, StubResponse>

// A manifest whose default board differs from the bundled table at the centre,
// so a configure can only have come from the server.
function servedManifest(basisPoints: number, centre: number): PlinkoManifest {
  const manifest = plinkoManifest()
  manifest.rtp_basis_points = basisPoints
  manifest.multipliers_hundredths['10']!.normal![5] = centre
  return manifest
}

function settledRound(basisPoints: number): PlayRoundResponse {
  const at = '2026-09-19T12:00:00Z'
  return {
    round: {
      id: 'round-live-1',
      game_id: plinko.id,
      game_slug: 'plinko',
      game_name: plinko.name,
      rtp_basis_points: basisPoints,
      status: 'settled',
      stake_minor: 100,
      win_minor: 50,
      multiplier_hundredths: 50,
      currency: 'PHP',
      started_at: at,
      settled_at: at,
    },
    result: { rows: 10, risk: 'normal', slot: 5 },
    wallet: { currency: 'PHP', balance_minor: 99_950 },
  }
}

async function openFrame() {
  const iframe = (await screen.findByTitle('Plinko game')) as HTMLIFrameElement
  const post = vi.spyOn(iframe.contentWindow as Window, 'postMessage')
  return { iframe, post }
}

function frameSays(iframe: HTMLIFrameElement, data: unknown) {
  window.dispatchEvent(
    new MessageEvent('message', { data, origin: window.location.origin, source: iframe.contentWindow }),
  )
}

type PostSpy = Awaited<ReturnType<typeof openFrame>>['post']

function posted(post: PostSpy, type: string) {
  return post.mock.calls
    .map((entry) => entry[0] as { type: string; multipliers_hundredths?: number[]; round_id?: string })
    .filter((message) => message.type === type)
}

function manifestRequests(fetchMock: ReturnType<typeof stubFetchRoutes>) {
  return fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/games/plinko/manifest'))
}

function roundsRequests(fetchMock: ReturnType<typeof stubFetchRoutes>) {
  return fetchMock.mock.calls.filter(([input]) => new URL(String(input), window.location.href).pathname.endsWith('/rounds'))
}

function playRequests(fetchMock: ReturnType<typeof stubFetchRoutes>) {
  return fetchMock.mock.calls.filter(
    ([input, init]) => init?.method === 'POST' && new URL(String(input), window.location.href).pathname.endsWith('/games/plinko/rounds'),
  )
}

describe('Plinko against a server without the play endpoint', () => {
  it('configures the board from the served manifest, reports the game as not available, and leaves the board idle', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchRoutes({
      ...page,
      'GET /games/plinko/manifest': { status: 200, body: servedManifest(9500, 55) },
      'POST /games/plinko/rounds': { status: 404, body: { error: 'Not found' } },
    })
    renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    act(() => frameSays(iframe, { v: 3, type: 'ready', game: 'plinko' }))
    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(1))
    expect(posted(post, 'configure')[0]?.multipliers_hundredths).toEqual([1000, 500, 250, 150, 80, 55, 80, 150, 250, 500, 1000])

    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))

    expect(await screen.findByText("This game isn't available right now.")).toBeInTheDocument()
    expect(posted(post, 'drop')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /^(Low|Normal|High)$/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'PLACE BET' })).toBeEnabled()

    const play = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(play).toBeDefined()
    const headers = play?.[1]?.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toMatch(/[0-9a-f-]{36}/)
    expect(JSON.parse(String(play?.[1]?.body))).toEqual({
      stake_minor: 100,
      currency: 'PHP',
      params: { rows: 10, risk: 'normal' },
    })
  })

  it('uses the active USD wallet and sends USD with the round', async () => {
    setActiveCurrency('USD')
    const user = userEvent.setup()
    const fetchMock = stubFetchRoutes({
      ...page,
      'GET /wallets/USD': { status: 200, body: { currency: 'USD', balance_minor: 100_000 } },
      'GET /games/plinko/manifest': { status: 200, body: servedManifest(9500, 55) },
      'POST /games/plinko/rounds': { status: 404, body: { error: 'Not found' } },
    })
    renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    act(() => frameSays(iframe, { v: 3, type: 'ready', game: 'plinko' }))
    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))

    await screen.findByText("This game isn't available right now.")
    const play = playRequests(fetchMock)[0]
    expect(JSON.parse(String(play?.[1]?.body))).toMatchObject({ stake_minor: 100, currency: 'USD' })
    const roundsUrl = new URL(String(roundsRequests(fetchMock)[0]?.[0]), window.location.href)
    expect(roundsUrl.searchParams.get('currency')).toBe('USD')
  })
})

describe('Plinko bet admission', () => {
  it('submits one rapid click, stays locked through the drop, and reveals the committed wallet on landing', async () => {
    const fetchMock = stubFetchRoutes({
      ...page,
      'GET /wallets/PHP': [
        { status: 200, body: { currency: 'PHP', balance_minor: 100_000 } },
        { status: 200, body: { currency: 'PHP', balance_minor: 99_950 } },
      ],
      'GET /games/plinko/manifest': { status: 200, body: servedManifest(9500, 55) },
      'POST /games/plinko/rounds': { status: 200, body: settledRound(9500) },
    })
    renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    act(() => frameSays(iframe, { v: 3, type: 'ready', game: 'plinko' }))
    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(1))
    const placeBet = screen.getByRole('button', { name: 'PLACE BET' })

    act(() => {
      placeBet.click()
      placeBet.click()
      placeBet.click()
    })

    expect(placeBet).toBeDisabled()
    await waitFor(() => expect(posted(post, 'drop')).toHaveLength(1))
    expect(playRequests(fetchMock)).toHaveLength(1)
    expect(placeBet).toBeDisabled()

    act(() => frameSays(iframe, { v: 3, type: 'landed', round_id: 'round-live-1', slot: 5 }))

    await waitFor(() => expect(placeBet).toBeEnabled())
    expect(await screen.findByRole('link', { name: 'Wallet balance ₱999.50' })).toBeInTheDocument()
  })
})

describe('Plinko without a manifest', () => {
  it('does not configure the frame or offer a bet when the server has no engine, and recovers on retry', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchRoutes({
      ...page,
      'GET /games/plinko/manifest': [
        { status: 404, body: { error: 'Game not found' } },
        { status: 200, body: servedManifest(9500, 55) },
      ],
    })
    renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 3, type: 'ready', game: 'plinko' })

    expect(await screen.findByRole('alert')).toHaveTextContent("This game isn't available right now.")
    expect(screen.getByRole('button', { name: 'PLACE BET' })).toBeDisabled()
    expect(posted(post, 'configure')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(manifestRequests(fetchMock)).toHaveLength(2))
    const remounted = await openFrame()
    expect(remounted.iframe).not.toBe(iframe)
    frameSays(remounted.iframe, { v: 3, type: 'ready', game: 'plinko' })
    await waitFor(() => expect(posted(remounted.post, 'configure')).toHaveLength(1))
    expect(posted(remounted.post, 'configure')[0]?.multipliers_hundredths?.[5]).toBe(55)
    await waitFor(() => expect(screen.getByRole('button', { name: 'PLACE BET' })).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("shows the server's reason when no RTP is set", async () => {
    stubFetchRoutes({
      ...page,
      'GET /games/plinko/manifest': {
        status: 409,
        body: { error: 'That game is not available right now', code: 'GAME_UNAVAILABLE' },
      },
    })
    renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 3, type: 'ready', game: 'plinko' })

    expect(await screen.findByRole('alert')).toHaveTextContent('That game is not available right now')
    expect(screen.getByRole('button', { name: 'PLACE BET' })).toBeDisabled()
    expect(posted(post, 'configure')).toHaveLength(0)
  })
})

describe('Plinko when the RTP changes mid-session', () => {
  it('refetches the manifest after a round settled at another return and reconfigures once the ball lands', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchRoutes({
      ...page,
      'GET /games/plinko/manifest': [
        { status: 200, body: servedManifest(9500, 55) },
        { status: 200, body: servedManifest(10500, 60) },
      ],
      'POST /games/plinko/rounds': { status: 200, body: settledRound(10500) },
    })
    const { queryClient } = renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 3, type: 'ready', game: 'plinko' })
    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))

    await waitFor(() => expect(posted(post, 'drop')).toHaveLength(1))
    await waitFor(() => expect(manifestRequests(fetchMock)).toHaveLength(2))
    // The new table has arrived, but the ball is still falling on the old board.
    await waitFor(() =>
      expect(queryClient.getQueryData(['game-manifest', 'plinko'])).toMatchObject({ rtp_basis_points: 10500 }),
    )
    expect(screen.getByRole('button', { name: /^(Low|Normal|High)$/ })).toBeDisabled()
    expect(posted(post, 'configure')).toHaveLength(1)

    frameSays(iframe, { v: 3, type: 'landed', round_id: 'round-live-1', slot: 5 })

    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(2))
    expect(posted(post, 'configure')[1]?.multipliers_hundredths?.[5]).toBe(60)
  })
})

describe('the history under the Plinko board', () => {
  it("lists the player's own settled rounds on the game and refetches them when a ball lands", async () => {
    const user = userEvent.setup()
    const earlier: Round = {
      ...settledRound(9500).round,
      id: 'round-live-0',
      stake_minor: 200,
      win_minor: 340,
      multiplier_hundredths: 170,
      started_at: '2026-09-19T11:00:00Z',
      settled_at: '2026-09-19T11:00:00Z',
    }
    const fetchMock = stubFetchRoutes({
      ...page,
      'GET /rounds': { status: 200, body: { rows: [earlier], total: 1, page: 1, size: 20, pages: 1 } },
      'GET /games/plinko/manifest': { status: 200, body: servedManifest(9500, 55) },
      'POST /games/plinko/rounds': { status: 200, body: settledRound(9500) },
    })
    renderApp('/game/plinko')

    const feed = await screen.findByRole('table', { name: 'History' })
    expect(within(feed).getAllByRole('row')).toHaveLength(2)
    expect(within(feed).getByText('1.70×')).toBeInTheDocument()
    expect(within(feed).getByText('+₱1.40')).toBeInTheDocument()
    expect(within(feed).queryByRole('columnheader', { name: 'Player' })).not.toBeInTheDocument()
    const roundsUrl = new URL(String(roundsRequests(fetchMock)[0]?.[0]), window.location.href)
    expect(roundsUrl.searchParams.get('game_id')).toBe(plinko.id)
    expect(roundsUrl.searchParams.get('currency')).toBe('PHP')
    const before = roundsRequests(fetchMock).length

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 3, type: 'ready', game: 'plinko' })
    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))
    await waitFor(() => expect(posted(post, 'drop')).toHaveLength(1))
    frameSays(iframe, { v: 3, type: 'landed', round_id: 'round-live-1', slot: 5 })

    await waitFor(() => expect(roundsRequests(fetchMock).length).toBeGreaterThan(before))
  })

  it('reports a feed that cannot be loaded without touching the board', async () => {
    stubFetchRoutes({
      ...page,
      'GET /rounds': { status: 400, body: { error: 'One or more fields are invalid' } },
      'GET /games/plinko/manifest': { status: 200, body: servedManifest(9500, 55) },
    })
    renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 3, type: 'ready', game: 'plinko' })
    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(1))

    expect(await screen.findByText('History unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PLACE BET' })).toBeEnabled()
    expect(screen.queryByRole('table', { name: 'History' })).not.toBeInTheDocument()
  })
})

describe('the favorite toggle against the server', () => {
  it('adds the game with a PUT, re-reads the list, and removes it with a DELETE', async () => {
    const user = userEvent.setup()
    const favoritePage = (rows: typeof plinko[]) => ({
      status: 200,
      body: { rows, total: rows.length, page: 1, size: 100, pages: 1 },
    })
    const fetchMock = stubFetchRoutes({
      ...page,
      'GET /games/plinko/manifest': { status: 200, body: servedManifest(9500, 55) },
      'GET /favorites': [favoritePage([]), favoritePage([plinko]), favoritePage([])],
      'PUT /games/plinko/favorite': { status: 204 },
      'DELETE /games/plinko/favorite': { status: 204 },
    })
    renderApp('/game/plinko')

    await user.click(await screen.findByRole('button', { name: 'Add to favorites' }))
    expect(await screen.findByRole('button', { name: 'Remove from favorites' })).toHaveAttribute('aria-pressed', 'true')
    expect(fetchMock.mock.calls.some(([input, init]) => init?.method === 'PUT' && String(input).endsWith('/games/plinko/favorite'))).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Remove from favorites' }))
    expect(await screen.findByRole('button', { name: 'Add to favorites' })).toHaveAttribute('aria-pressed', 'false')
    expect(fetchMock.mock.calls.some(([input, init]) => init?.method === 'DELETE' && String(input).endsWith('/games/plinko/favorite'))).toBe(true)
  })
})
