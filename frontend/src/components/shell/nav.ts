import {
  Dices,
  Flame,
  Gamepad2,
  Gift,
  Heart,
  Layers,
  Radio,
  Star,
  TrendingUp,
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
  { to: paths.games, label: 'Games', icon: Gamepad2, end: true },
  { to: paths.hotGames, label: 'Hot', icon: Flame },
  { to: paths.newGames, label: 'New', icon: Star },
  { to: paths.favorites, label: 'Favorites', icon: Heart, requiresAuth: true },
  { to: paths.promotions, label: 'Promotions', icon: Gift },
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
