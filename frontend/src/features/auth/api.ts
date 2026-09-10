import { ApiError, api } from '@/api/client'
import { mockRequest } from '@/api/mock'
import { usingMockApi } from '@/api/mode'
import type { User } from '@/api/types'
import { mockSession, mockSignIn, mockSignOut, mockSignUp } from '@/mocks/session'

import type { AdminLoginInput, LoginInput, RegisterInput } from './schemas'

export async function register(input: RegisterInput): Promise<User> {
  if (usingMockApi) {
    return mockRequest(() => mockSignUp(input), 500)
  }

  return api.post<User>('/register', {
    display_name: input.display_name,
    email: input.email,
    password: input.password,
  })
}

export async function login(input: LoginInput): Promise<User> {
  if (usingMockApi) {
    return mockRequest(() => mockSignIn(input.email, 'player'), 400)
  }

  return api.post<User>('/login', {
    email: input.email,
    password: input.password,
  })
}

export async function adminLogin(input: AdminLoginInput): Promise<User> {
  if (usingMockApi) {
    return mockRequest(() => mockSignIn(input.email, 'admin'), 400)
  }

  return api.post<User>('/login', {
    email: input.email,
    password: input.password,
  })
}

export async function logout(): Promise<void> {
  if (usingMockApi) {
    await mockRequest(mockSignOut, 120)
    return
  }

  await api.post<void>('/logout')
}

export async function fetchCurrentUser(): Promise<User | null> {
  if (usingMockApi) {
    return mockRequest(mockSession, 120)
  }

  try {
    return await api.get<User>('/me')
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) {
      return null
    }
    throw error
  }
}
