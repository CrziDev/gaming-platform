import { ApiError, api } from '@/api/client'
import { mockRequest } from '@/api/mock'
import { testFixturesEnabled } from '@/api/mode'
import type { User } from '@/api/types'

import type { AdminLoginInput, LoginInput, RegisterInput } from './schemas'

const usingTestFixtures = import.meta.env.MODE === 'test' && testFixturesEnabled

export async function register(input: RegisterInput): Promise<User> {
  return api.post<User>('/register', {
    display_name: input.display_name,
    email: input.email,
    password: input.password,
  })
}

export async function login(input: LoginInput): Promise<User> {
  return api.post<User>('/login', {
    email: input.email,
    password: input.password,
  })
}

export async function adminLogin(input: AdminLoginInput): Promise<User> {
  return api.post<User>('/login', {
    email: input.email,
    password: input.password,
  })
}

export async function logout(): Promise<void> {
  await api.post<void>('/logout')
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    return await api.get<User>('/me')
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) {
      return null
    }
    throw error
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  if (usingTestFixtures) {
    await mockRequest(() => undefined, 400)
    return
  }
  await api.post<void>('/password-reset', { email })
}

export async function confirmPasswordReset(input: { token: string; password: string }): Promise<void> {
  if (usingTestFixtures) {
    await mockRequest(() => undefined, 400)
    return
  }
  await api.post<void>('/password-reset/confirm', { token: input.token, password: input.password })
}

// The reset endpoints are in the contract but not yet on the server; a 404 is
// the server saying so, and the player should hear that rather than a promise.
export function describeResetFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'Password reset is not available yet. Contact support to change your password.'
  }
  if (error instanceof ApiError) {
    return error.message
  }
  return 'The request could not be sent. Check your connection and try again.'
}
