import { LogOut, Search, Settings, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'

import { MenuGlyph } from '@/components/shell/MenuGlyph'
import { IconButton } from '@/components/ui/Button'
import { useLogout, useSession } from '@/features/auth'
import { useDepositQueue } from '@/features/admin'
import { cn } from '@/lib/cn'
import { adminPaths } from '@/routes/paths'

import { adminNav } from './adminNav'

export function AdminShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-base">
      <AdminTopBar onOpenDrawer={() => setDrawerOpen(true)} />

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-52 shrink-0 overflow-y-auto bg-panel rail:block">
          <AdminNavPanel />
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto px-3.5 pt-3.5 pb-8 sm:px-5">
          <div className="mx-auto w-full max-w-[1320px]">
            <Outlet />
          </div>
        </main>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex rail:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-base/70"
          />
          <div className="relative flex w-72 max-w-[85vw] flex-col bg-panel">
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
      ) : null}
    </div>
  )
}

function AdminTopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { data: operator } = useSession()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 bg-panel px-3 sm:gap-3 sm:px-3.5">
      <IconButton label="Open navigation" onClick={onOpenDrawer} className="bg-inset rail:hidden">
        <MenuGlyph />
      </IconButton>

      <div className="flex items-center gap-2.5">
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink sm:text-[18px]">
          Console
        </span>
        <span className="label-mono hidden rounded-[5px] bg-wash px-1.5 py-1 text-ink-mute sm:inline">
          Live
        </span>
      </div>

      <div className="flex-1" />

      <label className="hidden min-w-70 items-center gap-2.5 rounded-input bg-inset px-2.5 lg:flex">
        <Search aria-hidden size={15} strokeWidth={1.5} className="text-ink-mute" />
        <input
          type="search"
          placeholder="Search player, ref or round id"
          aria-label="Search the console"
          className="min-h-[34px] flex-1 bg-transparent text-[13px] text-ink-soft placeholder:text-ink-mute focus:outline-none"
        />
      </label>

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
    'flex min-h-11 items-center gap-2.75 rounded-input px-2.75 text-[13.5px] transition-colors duration-[120ms] lg:min-h-9'

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
                      ? 'bg-wash font-medium text-ink-soft'
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
              isActive ? 'bg-wash font-medium text-ink-soft' : 'text-ink-mute hover:bg-wash hover:text-ink-soft',
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
