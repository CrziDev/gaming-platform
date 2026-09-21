import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'

import type { User } from '@/api/types'
import { SessionExpiredDialog } from '@/app/SessionExpiredDialog'
import { SessionGate } from '@/app/SessionGate'
import { createQueryClient } from '@/app/queryClient'
import { ToastProvider } from '@/components/ui/Toast'
import { AuthIntentProvider } from '@/features/auth'
import { AppRoutes } from '@/routes/AppRoutes'

export type StubResponse = {
  status: number
  body?: unknown
}

export function stubFetchRoutes(routes: Record<string, StubResponse | StubResponse[]>) {
  const queues = new Map<string, StubResponse[]>(
    Object.entries(routes).map(([key, value]) => [key, Array.isArray(value) ? [...value] : [value]]),
  )

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '')
    const key = `${method} ${path}`

    const queue = queues.get(key)
    if (!queue || queue.length === 0) {
      throw new Error(`stubFetchRoutes: no stub for ${key}`)
    }
    const next = queue.length > 1 ? queue.shift() : queue[0]
    if (!next) {
      throw new Error(`stubFetchRoutes: empty stub for ${key}`)
    }

    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function renderWithProviders(ui: ReactElement, options: { route?: string } = {}) {
  const queryClient = createQueryClient()
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={[options.route ?? '/']}>
            <AuthIntentProvider>{ui}</AuthIntentProvider>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  }
}

export function renderApp(route: string) {
  return renderWithProviders(
    <SessionGate>
      <AppRoutes />
      <SessionExpiredDialog />
    </SessionGate>,
    { route },
  )
}

export function userBody(overrides: Partial<User> = {}): User {
  return {
    id: '3f0f1a5e-9f3a-4a1e-9a3a-2c1d4e5f6a7b',
    email: 'owner@example.com',
    display_name: 'Owner',
    role: 'player',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function errorBody(message: string, fields?: Record<string, string>) {
  return fields ? { error: message, fields } : { error: message }
}

// What the shell fetches on every authenticated or public route outside the
// demo. A live-mode test spreads these so the chrome does not trip the stub.
export const liveShellStubs = {
  'GET /chat/messages': { status: 200, body: { online: 0, messages: [] } },
  'GET /notifications': { status: 200, body: { rows: [], total: 0, page: 1, size: 20, pages: 1 } },
  'GET /announcements': { status: 200, body: { rows: [], total: 0, page: 1, size: 100, pages: 1 } },
} satisfies Record<string, StubResponse>

// A WebSocket that never connects on its own; a test drives it by calling
// `emit` on the instance it finds in `FakeWebSocket.instances`.
export class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = []
  readonly url: string
  closed = false

  constructor(url: string) {
    super()
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  emit(type: 'open' | 'close'): void
  emit(type: 'message', data: string): void
  emit(type: 'open' | 'close' | 'message', data?: string) {
    this.dispatchEvent(type === 'message' ? new MessageEvent('message', { data }) : new Event(type))
  }

  close() {
    this.closed = true
    this.emit('close')
  }
}

export function stubWebSocket() {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  return FakeWebSocket
}
