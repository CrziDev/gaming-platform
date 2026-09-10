import {
  Dices,
  Gamepad2,
  Home,
  Layers,
  Radio,
  Receipt,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { paths } from '@/routes/paths'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean | undefined
  requiresAuth?: boolean | undefined
}

export const playerNav: NavItem[] = [
  { to: paths.lobby, label: 'Home', icon: Home, end: true },
  { to: paths.games, label: 'Games', icon: Gamepad2 },
  { to: paths.wallet, label: 'Wallet', icon: Wallet, requiresAuth: true },
  { to: paths.history, label: 'History', icon: Receipt, requiresAuth: true },
]

const categoryIcons: Record<string, LucideIcon> = {
  originals: Dices,
  crash: TrendingUp,
  slots: Layers,
  live: Radio,
}

export function categoryIcon(slug: string): LucideIcon {
  return categoryIcons[slug] ?? Layers
}
