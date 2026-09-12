import type { Role, User } from '@/api/types'

let current: User | null = null

export function mockSession(): User | null {
  return current
}

export function mockSignIn(email: string, role: Role): User {
  current = {
    id: role === 'admin' ? 'ad-0001' : 'us-0001',
    email,
    display_name: role === 'admin' ? 'R. Cruz' : email.split('@')[0] || 'player',
    role,
    created_at: new Date().toISOString(),
  }
  return current
}

export function mockSignUp(input: { display_name: string; email: string }): User {
  current = {
    id: 'us-new',
    email: input.email,
    display_name: input.display_name,
    role: 'player',
    created_at: new Date().toISOString(),
  }
  return current
}

export function mockSignOut(): void {
  current = null
}
