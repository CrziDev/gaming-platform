export const paths = {
  lobby: '/',
  games: '/games',
  hotGames: '/games/hot',
  newGames: '/games/new',
  game: (slug: string) => `/game/${slug}`,
  favorites: '/favorites',
  promotions: '/promotions',
  wallet: '/wallet',
  deposit: '/wallet/deposit',
  depositStatus: (id: string) => `/wallet/deposit/${id}`,
  history: '/history',
  account: '/account',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot',
  resetPassword: '/reset',
} as const

export const adminPaths = {
  login: '/admin/login',
  dashboard: '/admin',
  users: '/admin/users',
  user: (id: string) => `/admin/users/${id}`,
  transactions: '/admin/transactions',
  deposits: '/admin/deposits',
  games: '/admin/games',
  game: (id: string) => `/admin/games/${id}`,
  rounds: '/admin/rounds',
  rtp: '/admin/rtp',
  audit: '/admin/audit',
  settings: '/admin/settings',
} as const

export type RedirectTarget = {
  pathname: string
  search: string
  hash: string
}

export function safeRedirect(from: RedirectTarget | undefined): string | null {
  if (!from) {
    return null
  }
  const target = `${from.pathname}${from.search}${from.hash}`
  return target.startsWith('/') && !target.startsWith('//') ? target : null
}
