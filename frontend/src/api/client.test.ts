import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api } from '@/api/client'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(status: number, body: unknown, contentType = 'application/json') {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': contentType },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('api client', () => {
  it('returns the response body as it arrived', async () => {
    stubFetch(200, { id: 'abc' })

    await expect(api.get<{ id: string }>('/me')).resolves.toEqual({ id: 'abc' })
  })

  it('always sends credentials, because the session is an HttpOnly cookie', async () => {
    const fetchMock = stubFetch(200, {})

    await api.get('/me')

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' })
  })

  it('resolves a 204 with no body', async () => {
    stubFetch(204, undefined)

    await expect(api.post<void>('/logout')).resolves.toBeUndefined()
  })

  it('maps an error body onto ApiError, keeping the per-field messages', async () => {
    stubFetch(400, {
      error: 'One or more fields are invalid',
      fields: { email: 'Enter a valid email address' },
    })

    const error = await api.get('/me').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(400)
    expect(apiError.message).toBe('One or more fields are invalid')
    expect(apiError.fields).toEqual({ email: 'Enter a valid email address' })
  })

  it('reports a 401 as unauthenticated', async () => {
    stubFetch(401, { error: 'Authentication is required' })

    const error = (await api.get('/me').catch((caught: unknown) => caught)) as ApiError

    expect(error.isUnauthenticated).toBe(true)
    expect(error.fields).toEqual({})
  })

  it('does not leak a non-JSON body into the interface', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const error = (await api.get('/me').catch((caught: unknown) => caught)) as ApiError

    expect(error.status).toBe(502)
    expect(error.message).not.toContain('Bad Gateway')
  })
})
