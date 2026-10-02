import {
  Activity,
  Banknote,
  Gamepad2,
  Gift,
  HandCoins,
  LayoutDashboard,
  Megaphone,
  Percent,
  Receipt,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { adminPaths } from '@/routes/paths'

export type AdminNavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean | undefined
  badge?: 'deposits' | 'withdrawals' | undefined
}

export const adminNav: AdminNavItem[] = [
  { to: adminPaths.dashboard, label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: adminPaths.deposits, label: 'Deposits', icon: Banknote, badge: 'deposits' },
  { to: adminPaths.withdrawals, label: 'Withdrawals', icon: HandCoins, badge: 'withdrawals' },
  { to: adminPaths.users, label: 'Users', icon: Users },
  { to: adminPaths.transactions, label: 'Transactions', icon: Receipt },
  { to: adminPaths.rounds, label: 'Game rounds', icon: Activity },
  { to: adminPaths.games, label: 'Games', icon: Gamepad2 },
  { to: adminPaths.promotions, label: 'Promotions', icon: Gift },
  { to: adminPaths.announcements, label: 'Announcements', icon: Megaphone },
  { to: adminPaths.rtp, label: 'RTP', icon: Percent },
  { to: adminPaths.audit, label: 'Audit logs', icon: ScrollText },
]
