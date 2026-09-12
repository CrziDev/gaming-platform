import { NavLink } from 'react-router'

import { useAuthIntent, useSession } from '@/features/auth'
import { cn } from '@/lib/cn'

import { playerNav } from './nav'

export function BottomNav() {
  const { data: user } = useSession()
  const { open } = useAuthIntent()

  return (
    <nav
      aria-label="Primary"
      className="grid shrink-0 grid-cols-5 bg-panel pb-[env(safe-area-inset-bottom)] rail:hidden"
    >
      {playerNav.map((item) => {
        const Icon = item.icon
        const locked = item.requiresAuth && !user

        const body = (
          <>
            <Icon aria-hidden size={19} strokeWidth={1.5} />
            <span className="text-[10px]">{item.label}</span>
          </>
        )

        const shape = 'flex min-h-13 flex-col items-center justify-center gap-1 py-2'

        return locked ? (
          <button
            key={item.to}
            type="button"
            onClick={() => open({ tab: 'signin', redirectTo: item.to })}
            className={cn(shape, 'text-ink-mute')}
          >
            {body}
          </button>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) =>
              cn(shape, isActive ? 'font-medium text-ink-soft' : 'text-ink-mute')
            }
          >
            {body}
          </NavLink>
        )
      })}
    </nav>
  )
}
