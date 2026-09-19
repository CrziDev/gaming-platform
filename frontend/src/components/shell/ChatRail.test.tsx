import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '@/api/types'
import { FakeWebSocket, errorBody, renderApp, stubFetchRoutes, stubWebSocket, userBody } from '@/test-utils'

vi.mock('@/api/mode', () => ({ usingMockApi: false, usingFixtures: false }))

beforeEach(() => {
  stubWebSocket()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const player = { status: 200, body: userBody({ display_name: 'Rico Mercado' }) }
const wallet = { status: 200, body: { currency: 'PHP', balance_minor: 525_000 } }
const catalogue = {
  'GET /categories': { status: 200, body: [] },
  'GET /games': { status: 200, body: { rows: [], total: 0, page: 1, size: 100, pages: 1 } },
}

function message(id: string, text: string, role: ChatMessage['role'] = 'player'): ChatMessage {
  return { id, display_name: role === 'admin' ? 'sofia' : 'gregor56', role, text, created_at: '2026-09-19T12:00:00Z' }
}

function room(online: number, messages: ChatMessage[]) {
  return { status: 200, body: { online, messages } }
}

async function openSocket() {
  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
  const socket = FakeWebSocket.instances[0]!
  expect(socket.url).toBe('ws://localhost:8080/api/chat/socket')
  socket.emit('open')
  return socket
}

describe('the live chat rail against the server', () => {
  it('reads the room over HTTP, re-reads it when the socket says so, and shows pushed presence', async () => {
    const fetchMock = stubFetchRoutes({
      ...catalogue,
      'GET /me': player,
      'GET /wallets/PHP': wallet,
      'GET /chat/messages': [room(3, [message('m1', 'first')]), room(3, [message('m1', 'first'), message('m2', 'second', 'admin')])],
    })
    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Live chat' })
    expect(await within(rail).findByText('first')).toBeInTheDocument()
    expect(within(rail).getByText('3')).toBeInTheDocument()

    const socket = await openSocket()
    socket.emit('message', JSON.stringify({ type: 'presence', online: 7 }))
    expect(await within(rail).findByText('7')).toBeInTheDocument()

    const readsBefore = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/chat/messages')).length
    socket.emit('message', JSON.stringify({ type: 'message' }))
    expect(await within(rail).findByText('second')).toBeInTheDocument()
    expect(within(rail).getByText('sofia')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/chat/messages')).length).toBe(readsBefore + 1)
  })

  it('sends a message with the session and keeps the draft when the server refuses it', async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchRoutes({
      ...catalogue,
      'GET /me': player,
      'GET /wallets/PHP': wallet,
      'GET /chat/messages': room(1, []),
      'POST /chat/messages': [
        { status: 429, body: errorBody('You are sending messages too quickly. Try again shortly.') },
        { status: 201, body: message('m9', 'hello there') },
      ],
    })
    renderApp('/')

    const rail = await screen.findByRole('complementary', { name: 'Live chat' })
    await openSocket()
    const input = within(rail).getByRole('textbox', { name: 'Message' })
    await user.type(input, 'hello there')
    await user.click(within(rail).getByRole('button', { name: 'Send' }))

    expect(await within(rail).findByRole('alert')).toHaveTextContent('You are sending messages too quickly. Try again shortly.')
    expect(input).toHaveValue('hello there')

    await user.click(within(rail).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(input).toHaveValue(''))
    expect(within(rail).queryByRole('alert')).not.toBeInTheDocument()

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts).toHaveLength(2)
    expect(JSON.parse(String(posts[1]?.[1]?.body))).toEqual({ text: 'hello there' })
  })

  it('reconnects after the socket closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    stubFetchRoutes({ ...catalogue, 'GET /me': player, 'GET /wallets/PHP': wallet, 'GET /chat/messages': room(1, []) })
    renderApp('/')

    await screen.findByRole('complementary', { name: 'Live chat' })
    const first = await openSocket()
    first.emit('close')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.useRealTimers()
  })
})
