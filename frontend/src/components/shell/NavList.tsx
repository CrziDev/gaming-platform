import { NavLink } from 'react-router'

import { useAuthIntent, useSession } from '@/features/auth'
import { cn } from '@/lib/cn'

import type { NavItem } from './nav'
import { railLabel, railRow, type RailMode } from './rail'

type NavListProps = {
  items: NavItem[]
  mode?: RailMode
  onNavigate?: () => void
}

export function NavList({ items, mode = 'expanded', onNavigate }: NavListProps) {
  const { data: user } = useSession()
  const { open } = useAuthIntent()

  return (
    <ul className="flex flex-col gap-px">
      {items.map((item) => {
        const Icon = item.icon
        const locked = item.requiresAuth && !user

        const body = (
          <>
            <Icon aria-hidden size={17} strokeWidth={1.5} className="shrink-0" />
            <span className={railLabel[mode]}>{item.label}</span>
          </>
        )

        const shape = cn(
          'flex min-h-11 items-center gap-2.75 rounded-input px-2.75 text-[13.5px] lg:min-h-9',
          'transition-colors duration-[120ms] ease-standard',
          railRow[mode],
        )

        return (
          <li key={item.to}>
            {locked ? (
              <button
                type="button"
                title={mode === 'expanded' ? undefined : item.label}
                onClick={() => {
                  onNavigate?.()
                  open({ tab: 'signin', redirectTo: item.to })
                }}
                className={cn(shape, 'w-full text-ink-mute hover:bg-wash hover:text-ink-soft')}
              >
                {body}
              </button>
            ) : (
              <NavLink
                to={item.to}
                end={item.end ?? false}
                {...(mode === 'expanded' ? {} : { title: item.label })}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className={({ isActive }) =>
                  cn(
                    shape,
                    isActive
                      ? 'bg-wash font-medium text-ink-soft'
                      : 'text-ink-mute hover:bg-wash hover:text-ink-soft',
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
