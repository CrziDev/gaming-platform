import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlayRoundResponse, PlinkoManifest } from '@/api/types'
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
