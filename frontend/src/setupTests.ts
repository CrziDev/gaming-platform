import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

import { clearSessionExpired } from '@/features/auth/expiry'

// Session expiry is module state so a signed-in test must not make the next
// test's guest look like a session that just ended.
afterEach(() => {
  clearSessionExpired()
})
