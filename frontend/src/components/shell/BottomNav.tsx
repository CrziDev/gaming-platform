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
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {playerNav.map((item) => {
        const Icon = item.icon
        const locked = item.requiresAuth && !user

        const body = (
          <>
            <Icon aria-hidden size={20} strokeWidth={1.5} />
            <span className="text-[10.5px]">{item.label}</span>
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
              cn(shape, isActive ? 'font-semibold text-accent' : 'text-ink-mute')
            }
          >
            {body}
          </NavLink>
        )
      })}
    </nav>
  )
}
