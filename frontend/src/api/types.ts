import type { Currency } from '@/lib/money'

export type Role = 'player' | 'admin'

export type User = {
  id: string
  email: string
  display_name: string
  role: Role
  created_at: string
}

export type AccountStatus = 'active' | 'suspended' | 'closed'

export type AdminUser = User & {
  status: AccountStatus
}

export type ApiErrorBody = {
  error: string
  code?: string
  fields?: Record<string, string>
}

export type CurrencyMetadata = {
  code: Currency
  name: string
  symbol: string
  minor_units: number
  deposit_min_minor: number
  deposit_max_minor: number
}

export type Category = {
  slug: string
  name: string
  game_count: number
  available: boolean
}

export type GameStatus = 'draft' | 'active' | 'maintenance' | 'retired'

export type GameFlag = 'hot' | 'new'

export type Game = {
  id: string
  slug: string
  name: string
  category_slug: string
  category_name: string
  provider: string
  status: GameStatus
  currency: Currency
  min_wager_minor: number
  max_wager_minor: number
  wager_step_minor: number
  art_seed: number
  flags: GameFlag[]
}

export type LobbyRow = {
  id: string
  title: string
  category_slug: string | null
  game_ids: string[]
}

export type BigWin = {
  id: string
  username: string
  game_slug: string
  amount_minor: number
  currency: Currency
  created_at: string
}

export type Promotion = {
  id: string
  kicker: string
  title: string
  subtitle: string
}

export type ChatMessage = {
  id: string
  user: string
  role: Role
  text: string
  created_at: string
}

export type ChatRoom = {
  online: number
  messages: ChatMessage[]
}

export type Wallet = {
  currency: Currency
  balance_minor: number
}

export type TransactionKind =
  | 'deposit'
  | 'withdrawal'
  | 'wager'
  | 'win'
  | 'refund'
  | 'adjustment'
export type TransactionStatus = 'pending' | 'approved' | 'rejected' | 'settled' | 'applied'

export type Transaction = {
  id: string
  kind: TransactionKind
  label: string
  reference: string
  status: TransactionStatus
  amount_minor: number
  currency: Currency
  created_at: string
  round_id: string | null
}

export type Round = {
  id: string
  game_slug: string
  game_name: string
  stake_minor: number
  multiplier_hundredths: number | null
  result_minor: number
  currency: Currency
  created_at: string
}

export type DepositStatus = 'pending' | 'approved' | 'rejected'

export type DepositRequest = {
  id: string
  reference: string
  method_id: string
  method_name: string
  amount_minor: number
  currency: Currency
  status: DepositStatus
  created_at: string
  reviewed_at: string | null
  reason: string | null
}

export type PaymentMethod = {
  id: string
  name: string
  description: string
  pay_to: string
  reference_required: boolean
  enabled: boolean
}

export type Notification = {
  id: string
  message: string
  amount_minor: number | null
  currency: Currency | null
  created_at: string
  read: boolean
}

export type Adjustment = {
  id: string
  user_id: string
  amount_minor: number
  currency: Currency
  reason: string
  operator: string
  created_at: string
}

export type AuditEntry = {
  id: string
  created_at: string
  operator: string
  action: string
  entity: string
  detail: string
}

export type AdminDeposit = DepositRequest & {
  user_id: string
  username: string
  user_balance_minor?: number
  approved_count?: number
  rejected_count?: number
}

export type RtpStatus = 'draft' | 'verified' | 'active' | 'retired'

export type RtpProfile = {
  id: string
  game_id: string
  game_name: string
  basis_points: number
  status: RtpStatus
  scheduled_end: string | null
  operator: string
  created_at: string
}

export type AdminGame = {
  id: string
  slug: string
  name: string
  category_name: string
  provider: string
  status: GameStatus
  integration: string
  active_rtp_basis_points: number
  rounds_30d: number
}

export type ConsoleAlert = {
  id: string
  tone: 'warning' | 'danger' | 'neutral'
  message: string
  href: string
}

export type DashboardSummary = {
  pending_deposits: number
  pending_held_minor: number
  oldest_pending_at: string | null
  approved_today_minor: number
  approved_today_count: number
  staked_today_minor: number
  rounds_today: number
  players_today: number
  returned_today_minor: number
  effective_rtp_basis_points: number
  target_rtp_basis_points: number
  currency: Currency
}
