import { NavLink } from 'react-router'

import { useAuthIntent, useSession } from '@/features/auth'
import { cn } from '@/lib/cn'

import type { NavItem } from './nav'

type NavListProps = {
  items: NavItem[]
  collapsed?: boolean
  onNavigate?: () => void
}

export function NavList({ items, collapsed = false, onNavigate }: NavListProps) {
  const { data: user } = useSession()
  const { open } = useAuthIntent()

  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = item.icon
        const locked = item.requiresAuth && !user

        const body = (
          <>
            <Icon aria-hidden size={18} strokeWidth={1.5} className="shrink-0" />
            {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
          </>
        )

        const shape = cn(
          'flex min-h-11 items-center gap-3 rounded-input text-[13px]',
          'transition-colors duration-[120ms] ease-standard',
          collapsed ? 'justify-center px-0' : 'px-3',
        )

        return (
          <li key={item.to}>
            {locked ? (
              <button
                type="button"
                title={collapsed ? item.label : undefined}
                onClick={() => {
                  onNavigate?.()
                  open({ tab: 'signin', redirectTo: item.to })
                }}
                className={cn(shape, 'w-full text-ink-mute hover:text-ink')}
              >
                {body}
              </button>
            ) : (
              <NavLink
                to={item.to}
                end={item.end ?? false}
                {...(collapsed ? { title: item.label } : {})}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className={({ isActive }) =>
                  cn(
                    shape,
                    isActive
                      ? 'bg-accent/12 font-semibold text-accent'
                      : 'text-ink-mute hover:text-ink',
                  )
                }
              >
                {body}
              </NavLink>
            )}
          </li>
        )
      })}
    </ul>
  )
}
