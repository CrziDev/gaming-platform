import type { ApiErrorBody } from '@/api/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly fields: Record<string, string>

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    fields: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }

  get isUnauthenticated(): boolean {
    return this.status === 401
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, headers: extraHeaders } = options

  const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders }
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? null : body instanceof FormData ? body : JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })

  if (response.status === 204) {
    return undefined as T
  }

  const payload = await readJson(response)

  if (!response.ok) {
    throw toApiError(response.status, payload)
  }

  return payload as T
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  const body = payload as ApiErrorBody | null

  if (!body || typeof body.error !== 'string') {
    return new ApiError(status, 'The server returned an unexpected response')
  }

  return new ApiError(status, body.error, body.code ?? null, body.fields ?? {})
}
