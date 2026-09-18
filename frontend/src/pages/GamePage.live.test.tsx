import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { games } from '@/mocks/games'
import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

vi.mock('@/api/mode', () => ({ usingMockApi: false, usingFixtures: false }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const plinko = games.find((game) => game.slug === 'plinko')!

describe('Plinko against a server without the play endpoint', () => {
  it('reports the game as not available and leaves the board idle', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchRoutes({
      'GET /me': { status: 200, body: userBody() },
      'GET /games/plinko': { status: 200, body: plinko },
      'GET /games': { status: 200, body: { rows: [plinko], total: 1, page: 1, size: 100, pages: 1 } },
      'GET /wallets/PHP': { status: 200, body: { currency: 'PHP', balance_minor: 100_000 } },
      'GET /rounds': { status: 200, body: { rows: [], total: 0, page: 1, size: 20, pages: 1 } },
      'POST /games/plinko/rounds': { status: 404, body: { error: 'Not found' } },
    })
    renderApp('/game/plinko')

    const iframe = (await screen.findByTitle('Plinko game')) as HTMLIFrameElement
    const post = vi.spyOn(iframe.contentWindow as Window, 'postMessage')
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { v: 1, type: 'ready', game: 'plinko' },
        origin: window.location.origin,
        source: iframe.contentWindow,
      }),
    )
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'configure' }), window.location.origin))

    await user.click(screen.getByRole('button', { name: 'PLACE BET' }))

    expect(await screen.findByText('Plinko is not available on this server yet.')).toBeInTheDocument()
    expect(post.mock.calls.some((entry) => (entry[0] as { type: string }).type === 'drop')).toBe(false)
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
