import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlayRoundResponse, PlinkoManifest, Round } from '@/api/types'
import { games } from '@/mocks/games'
import { plinkoManifest } from '@/mocks/plinko'
import { renderApp, stubFetchRoutes, userBody, type StubResponse } from '@/test-utils'

vi.mock('@/api/mode', () => ({ usingMockApi: false, usingFixtures: false }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const plinko = games.find((game) => game.slug === 'plinko')!

const page = {
  'GET /me': { status: 200, body: userBody() },
  'GET /games/plinko': { status: 200, body: plinko },
  'GET /games': { status: 200, body: { rows: [plinko], total: 1, page: 1, size: 100, pages: 1 } },
  'GET /wallets/PHP': { status: 200, body: { currency: 'PHP', balance_minor: 100_000 } },
  'GET /rounds': { status: 200, body: { rows: [], total: 0, page: 1, size: 20, pages: 1 } },
  'GET /favorites': { status: 200, body: { rows: [], total: 0, page: 1, size: 100, pages: 1 } },
} satisfies Record<string, StubResponse>

// A manifest whose default board differs from the bundled table at the centre,
// so a configure can only have come from the server.
function servedManifest(profileId: string, centre: number): PlinkoManifest {
  const manifest = plinkoManifest()
  manifest.rtp_profile_id = profileId
  manifest.multipliers_hundredths['8']!.normal![4] = centre
  return manifest
}

function settledRound(profileId: string): PlayRoundResponse {
  const at = '2026-09-19T12:00:00Z'
  return {
    round: {
      id: 'round-live-1',
      game_id: plinko.id,
      game_slug: 'plinko',
      game_name: plinko.name,
      rtp_profile_id: profileId,
      status: 'settled',
      stake_minor: 100,
      win_minor: 50,
      multiplier_hundredths: 50,
      currency: 'PHP',
      started_at: at,
      settled_at: at,
    },
    result: { rows: 8, risk: 'normal', slot: 4 },
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
  return fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname.endsWith('/rounds'))
}

describe('Plinko against a server without the play endpoint', () => {
  it('configures the board from the served manifest, reports the game as not available, and leaves the board idle', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchRoutes({
      ...page,
      'GET /games/plinko/manifest': { status: 200, body: servedManifest('profile-a', 55) },
      'POST /games/plinko/rounds': { status: 404, body: { error: 'Not found' } },
    })
    renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 1, type: 'ready', game: 'plinko' })
    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(1))
    expect(posted(post, 'configure')[0]?.multipliers_hundredths).toEqual([600, 300, 170, 110, 55, 110, 170, 300, 600])

    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))

    expect(await screen.findByText('Plinko is not available on this server yet.')).toBeInTheDocument()
    expect(posted(post, 'drop')).toHaveLength(0)
    expect(screen.getByRole('radio', { name: '8' })).not.toHaveAttribute('aria-disabled')

    const play = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(play).toBeDefined()
    const headers = play?.[1]?.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toMatch(/[0-9a-f-]{36}/)
    expect(JSON.parse(String(play?.[1]?.body))).toEqual({
      stake_minor: 100,
      currency: 'PHP',
      params: { rows: 8, risk: 'normal' },
    })
  })
})

describe('Plinko without a manifest', () => {
  it('does not configure the frame or offer a bet when the server has no engine, and recovers on retry', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchRoutes({
      ...page,
      'GET /games/plinko/manifest': [
        { status: 404, body: { error: 'Game not found' } },
        { status: 200, body: servedManifest('profile-a', 55) },
      ],
    })
    renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 1, type: 'ready', game: 'plinko' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Plinko is not available on this server yet.')
    expect(screen.getByRole('button', { name: 'PLACE BET' })).toBeDisabled()
    expect(posted(post, 'configure')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(manifestRequests(fetchMock)).toHaveLength(2))
    const remounted = await openFrame()
    expect(remounted.iframe).not.toBe(iframe)
    frameSays(remounted.iframe, { v: 1, type: 'ready', game: 'plinko' })
    await waitFor(() => expect(posted(remounted.post, 'configure')).toHaveLength(1))
    expect(posted(remounted.post, 'configure')[0]?.multipliers_hundredths?.[4]).toBe(55)
    await waitFor(() => expect(screen.getByRole('button', { name: 'PLACE BET' })).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("shows the server's reason when no profile is active", async () => {
    stubFetchRoutes({
      ...page,
      'GET /games/plinko/manifest': {
        status: 409,
        body: { error: 'That game is not available right now', code: 'GAME_UNAVAILABLE' },
      },
    })
    renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 1, type: 'ready', game: 'plinko' })

    expect(await screen.findByRole('alert')).toHaveTextContent('That game is not available right now')
    expect(screen.getByRole('button', { name: 'PLACE BET' })).toBeDisabled()
    expect(posted(post, 'configure')).toHaveLength(0)
  })
})

describe('Plinko when the active profile changes mid-session', () => {
  it('refetches the manifest after a round settled on another profile and reconfigures once the ball lands', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchRoutes({
      ...page,
      'GET /games/plinko/manifest': [
        { status: 200, body: servedManifest('profile-a', 55) },
        { status: 200, body: servedManifest('profile-b', 60) },
      ],
      'POST /games/plinko/rounds': { status: 200, body: settledRound('profile-b') },
    })
    const { queryClient } = renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 1, type: 'ready', game: 'plinko' })
    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))

    await waitFor(() => expect(posted(post, 'drop')).toHaveLength(1))
    await waitFor(() => expect(manifestRequests(fetchMock)).toHaveLength(2))
    // The new table has arrived, but the ball is still falling on the old board.
    await waitFor(() =>
      expect(queryClient.getQueryData(['game-manifest', 'plinko'])).toMatchObject({ rtp_profile_id: 'profile-b' }),
    )
    expect(screen.getByRole('radio', { name: '8' })).toHaveAttribute('aria-disabled', 'true')
    expect(posted(post, 'configure')).toHaveLength(1)

    frameSays(iframe, { v: 1, type: 'landed', round_id: 'round-live-1', slot: 4 })

    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(2))
    expect(posted(post, 'configure')[1]?.multipliers_hundredths?.[4]).toBe(60)
  })
})

describe('the history under the Plinko board', () => {
  it("lists the player's own settled rounds on the game and refetches them when a ball lands", async () => {
    const user = userEvent.setup()
    const earlier: Round = {
      ...settledRound('profile-a').round,
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
      'GET /games/plinko/manifest': { status: 200, body: servedManifest('profile-a', 55) },
      'POST /games/plinko/rounds': { status: 200, body: settledRound('profile-a') },
    })
    renderApp('/game/plinko')

    const feed = await screen.findByRole('table', { name: 'History' })
    expect(within(feed).getAllByRole('row')).toHaveLength(2)
    expect(within(feed).getByText('1.70×')).toBeInTheDocument()
    expect(within(feed).getByText('+₱1.40')).toBeInTheDocument()
    expect(within(feed).queryByRole('columnheader', { name: 'Player' })).not.toBeInTheDocument()
    const roundsUrl = new URL(String(roundsRequests(fetchMock)[0]?.[0]))
    expect(roundsUrl.searchParams.get('game_id')).toBe(plinko.id)
    const before = roundsRequests(fetchMock).length

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 1, type: 'ready', game: 'plinko' })
    await waitFor(() => expect(posted(post, 'configure')).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))
    await waitFor(() => expect(posted(post, 'drop')).toHaveLength(1))
    frameSays(iframe, { v: 1, type: 'landed', round_id: 'round-live-1', slot: 4 })

    await waitFor(() => expect(roundsRequests(fetchMock).length).toBeGreaterThan(before))
  })

  it('reports a feed that cannot be loaded without touching the board', async () => {
    stubFetchRoutes({
      ...page,
      'GET /rounds': { status: 400, body: { error: 'One or more fields are invalid' } },
      'GET /games/plinko/manifest': { status: 200, body: servedManifest('profile-a', 55) },
    })
    renderApp('/game/plinko')

    const { iframe, post } = await openFrame()
    frameSays(iframe, { v: 1, type: 'ready', game: 'plinko' })
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
      'GET /games/plinko/manifest': { status: 200, body: servedManifest('profile-a', 55) },
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
