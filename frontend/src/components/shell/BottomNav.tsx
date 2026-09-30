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
      className="glass-chrome grid shrink-0 grid-cols-5 border-t border-white/8 pb-[env(safe-area-inset-bottom)] rail:hidden"
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

        const shape =
          'relative flex min-h-13 flex-col items-center justify-center gap-1 py-2 transition-[color,background-color,transform] duration-fast ease-standard active:translate-y-px motion-reduce:transform-none'

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
              cn(
                shape,
                isActive
                  ? 'font-medium text-accent-ink before:absolute before:top-0 before:h-0.5 before:w-8 before:rounded-b-sm before:bg-accent-ink'
                  : 'text-ink-mute',
              )
            }
          >
            {body}
          </NavLink>
        )
      })}
    </nav>
  )
}
