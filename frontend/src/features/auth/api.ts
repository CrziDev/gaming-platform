import { ApiError, api } from '@/api/client'
import type { User } from '@/api/types'

import type { AdminLoginInput, ChangePasswordInput, LoginInput, RegisterInput } from './schemas'

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
  await api.post<void>('/password-reset', { email })
}

export async function confirmPasswordReset(input: { token: string; password: string }): Promise<User> {
  return api.post<User>('/password-reset/confirm', { token: input.token, password: input.password })
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await api.post<void>('/password', {
    current_password: input.current_password,
    password: input.password,
  })
}

export function describeResetFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return 'Password reset is unavailable right now. Try again later.'
  }
  if (error instanceof ApiError) {
    return error.message
  }
  return 'The request could not be sent. Check your connection and try again.'
}
