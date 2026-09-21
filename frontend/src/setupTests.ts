import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

import { clearSessionExpired } from '@/features/auth/expiry'

// Feature adapters load fixtures dynamically so application bundles can erase them.
// Preload those modules once per test worker to keep UI waits deterministic.
import '@/mocks/admin'
import '@/mocks/announcements'
import '@/mocks/chat'
import '@/mocks/games'
import '@/mocks/plinko'
import '@/mocks/wallet'

// Session expiry is module state so a signed-in test must not make the next
// test's guest look like a session that just ended.
afterEach(() => {
  clearSessionExpired()
})
