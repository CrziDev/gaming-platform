import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderApp, stubFetchRoutes, userBody } from '@/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

const player = { status: 200, body: userBody() }
const admin = { status: 200, body: userBody({ role: 'admin', display_name: 'R. Cruz' }) }

const playerRoutes: [string, string][] = [
  ['/', 'Featured'],
  ['/games', 'Games'],
  ['/game/aurora-dice', 'Aurora Dice'],
  ['/wallet', 'Wallet'],
  ['/wallet/deposit', 'Deposit'],
  ['/wallet/deposit/dep-8841', 'Request 8841'],
  ['/history', 'History'],
  ['/account', 'Account'],
]

const consoleRoutes: [string, string][] = [
  ['/admin', 'Today'],
  ['/admin/deposits', 'Deposits'],
  ['/admin/users', 'Users'],
  ['/admin/users/us-0001', 'PHP wallet'],
  ['/admin/transactions', 'Transactions'],
  ['/admin/rounds', 'Game rounds'],
  ['/admin/games', 'Games'],
  ['/admin/games/gm-001', 'Configuration'],
  ['/admin/rtp', 'RTP profiles'],
  ['/admin/audit', 'Audit logs'],
  ['/admin/settings', 'Settings'],
]

describe('every player route renders for a signed-in player', () => {
  it.each(playerRoutes)('%s', async (route, marker) => {
    stubFetchRoutes({ 'GET /me': player })

    renderApp(route)

    expect(await screen.findAllByText(new RegExp(escape(marker), 'i'))).not.toHaveLength(0)
  })
})

describe('every console route renders for an admin', () => {
  it.each(consoleRoutes)('%s', async (route, marker) => {
    stubFetchRoutes({ 'GET /me': admin })

    renderApp(route)

    expect(await screen.findAllByText(new RegExp(escape(marker), 'i'))).not.toHaveLength(0)
  })
})

describe('routes outside a session', () => {
  it.each([
    ['/forgot', 'Forgot password'],
    ['/reset', 'Choose a new password'],
    ['/nothing-here', 'Page not found'],
  ])('%s', async (route, marker) => {
    stubFetchRoutes({ 'GET /me': { status: 401, body: { error: 'Authentication is required' } } })

    renderApp(route)

    expect(await screen.findByText(marker)).toBeInTheDocument()
  })
})

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
