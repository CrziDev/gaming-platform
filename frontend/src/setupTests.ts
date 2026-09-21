import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

import { clearSessionExpired } from '@/features/auth/expiry'
import { setActiveCurrency } from '@/features/wallet/activeCurrency'

// Feature adapters load fixtures dynamically so application bundles can erase them.
// Preload those modules once per test worker to keep UI waits deterministic.
import '@/mocks/admin'
import '@/mocks/announcements'
import '@/mocks/chat'
import '@/mocks/games'
import '@/mocks/plinko'
import '@/mocks/wallet'

// Session expiry and the active currency are both module state, so a test that
// changes either must not leak it into the next test or test file.
afterEach(() => {
  clearSessionExpired()
  setActiveCurrency('PHP')
})
