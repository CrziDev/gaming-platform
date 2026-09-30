import { LogOut, Settings, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'

import { MenuGlyph } from '@/components/shell/MenuGlyph'
import { IconButton } from '@/components/ui/Button'
import { useLogout, useSession } from '@/features/auth'
import { useDepositQueue } from '@/features/admin'
import { cn } from '@/lib/cn'
import { adminPaths } from '@/routes/paths'

import { adminNav } from './adminNav'
import { AdminConsoleSearch } from './AdminConsoleSearch'

export function AdminShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!drawerOpen) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const targets = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!targets || targets.length === 0) return
      const first = targets[0]
      const last = targets[targets.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [drawerOpen])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <AdminTopBar onOpenDrawer={() => setDrawerOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <div className="glass-chrome hidden w-52 shrink-0 overflow-y-auto border-r border-hairline rail:block">
          <AdminNavPanel />
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto px-3.5 pt-3.5 pb-8 sm:px-5">
          <div className="mx-auto w-full max-w-[1320px]">
            <Outlet />
          </div>
        </main>
      </div>

      <div
        className={cn('fixed inset-0 z-50 flex rail:hidden', !drawerOpen && 'pointer-events-none')}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className={cn(
            'absolute inset-0 bg-base/70 transition-opacity duration-standard ease-standard motion-reduce:transition-none',
            drawerOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Console navigation"
          className={cn(
            'overlay-shadow glass-chrome relative flex w-72 max-w-[85vw] flex-col border-r border-hairline transition-[transform,opacity] duration-layout ease-standard motion-reduce:transition-none',
            drawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0',
          )}
        >
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Console</span>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
              className="flex size-11 items-center justify-center rounded-input text-ink-mute hover:bg-wash hover:text-ink-soft"
            >
              <X aria-hidden size={18} strokeWidth={1.5} />
            </button>
          </div>
          <AdminNavPanel onNavigate={() => setDrawerOpen(false)} />
        </div>
      </div>
    </div>
  )
}

function AdminTopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { data: operator } = useSession()

  return (
    <header className="glass-chrome chrome-edge relative flex h-18 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-3.5">
      <IconButton label="Open navigation" onClick={onOpenDrawer} className="text-ink-soft rail:hidden">
        <MenuGlyph />
      </IconButton>

      <div className="flex items-center gap-2.5">
        <span className="text-[18px] font-bold tracking-[-0.03em] text-ink sm:text-[21px]">
          Hezi<span className="text-brand">Bet</span> <span className="font-semibold text-ink-soft">Console</span>
        </span>
        <span className="label-mono hidden rounded-[5px] bg-wash px-1.5 py-1 text-ink-cool sm:inline">
          Live
        </span>
      </div>

      <div className="flex-1" />

      <AdminConsoleSearch />

      {operator ? (
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-[26px] items-center justify-center rounded-full bg-surface-3 font-mono text-[10.5px] font-medium text-ink-mute uppercase"
          >
            {operator.display_name.slice(0, 2)}
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-[12.5px] font-medium text-ink-soft">{operator.display_name}</span>
            <span className="font-mono text-[10px] text-ink-mute">Operator</span>
          </span>
        </div>
      ) : null}
    </header>
  )
}

function AdminNavPanel({ onNavigate }: { onNavigate?: () => void }) {
  // The badge wants the count, not the rows; the smallest page still carries `total`.
  const { data: queue } = useDepositQueue(1, 1)
  const logoutMutation = useLogout()
  const navigate = useNavigate()

  const shape =
    'relative flex min-h-11 items-center gap-2.75 rounded-input px-2.75 text-[13.5px] transition-[color,background-color,transform] duration-fast ease-standard active:translate-y-px motion-reduce:transform-none lg:min-h-9'

  const signOut = async () => {
    await logoutMutation.mutateAsync()
    await navigate(adminPaths.login)
  }

  return (
    <nav aria-label="Console navigation" className="flex h-full flex-col gap-3 px-2 py-3">
      <ul className="flex flex-col gap-px">
        {adminNav.map((item) => {
          const Icon = item.icon
          const count = item.badge === 'deposits' ? queue?.total : undefined

          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end ?? false}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className={({ isActive }) =>
                  cn(
                    shape,
                    isActive
                      ? 'bg-wash font-medium text-ink-soft before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-sm before:bg-accent-ink'
                      : 'text-ink-mute hover:bg-wash hover:text-ink-soft',
                  )
                }
              >
                <Icon aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
                {item.label}
                {count ? (
                  <span className="ml-auto rounded-[5px] bg-warning/12 px-1.5 py-0.5 font-mono text-[11px] font-medium text-warning">
                    {count}
                  </span>
                ) : null}
              </NavLink>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-px">
        <NavLink
          to={adminPaths.settings}
          {...(onNavigate ? { onClick: onNavigate } : {})}
          className={({ isActive }) =>
            cn(
              shape,
              isActive
                ? 'bg-wash font-medium text-ink-soft before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-sm before:bg-accent-ink'
                : 'text-ink-mute hover:bg-wash hover:text-ink-soft',
            )
          }
        >
          <Settings aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
          Settings
        </NavLink>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={logoutMutation.isPending}
          className={cn(shape, 'w-full text-ink-mute hover:bg-wash hover:text-ink-soft')}
        >
          <LogOut aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
          Sign out
        </button>
      </div>
    </nav>
  )
}
