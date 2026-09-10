import { LogOut, Menu, Search, Settings, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'

import { IconButton } from '@/components/ui/Button'
import { useLogout, useSession } from '@/features/auth'
import { useDepositQueue } from '@/features/admin'
import { cn } from '@/lib/cn'
import { adminPaths } from '@/routes/paths'

import { adminNav } from './adminNav'

export function AdminShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-base">
      <AdminTopBar onOpenDrawer={() => setDrawerOpen(true)} />

      <div className="flex">
        <div className="sticky top-15 hidden h-[calc(100dvh-3.75rem)] w-57 shrink-0 border-r border-line bg-panel lg:block">
          <AdminNavPanel />
        </div>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-[#06090f]/70"
          />
          <div className="relative flex w-72 max-w-[85vw] flex-col border-r border-line bg-panel">
            <div className="flex items-center justify-between p-4">
              <span className="font-display text-[15px] font-semibold">Console</span>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                className="flex size-11 items-center justify-center rounded-input text-ink-mute"
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
    <header className="sticky top-0 z-40 h-15 border-b border-line bg-panel">
      <div className="flex h-full items-center gap-3 px-3 sm:px-4">
        <IconButton label="Open navigation" onClick={onOpenDrawer} className="lg:hidden">
          <Menu aria-hidden size={18} strokeWidth={1.5} />
        </IconButton>

        <div className="flex items-center gap-2.5">
          <span aria-hidden className="size-6.5 rounded-lg border border-line-strong bg-line" />
          <span className="font-display text-[15px] font-semibold">Console</span>
          <span className="hidden rounded-chip border border-line-strong px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-mute uppercase sm:inline">
            Live
          </span>
        </div>

        <div className="flex-1" />

        <label className="hidden min-w-70 items-center gap-2.5 rounded-input border border-line bg-surface-1 px-3 lg:flex">
          <Search aria-hidden size={15} strokeWidth={1.5} className="text-ink-mute" />
          <input
            type="search"
            placeholder="Search player, ref or round id"
            aria-label="Search the console"
            className="min-h-9 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-mute focus:outline-none"
          />
        </label>

        {operator ? (
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="size-8 rounded-full border border-line-strong bg-line" />
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="text-[12.5px] font-semibold">{operator.display_name}</span>
              <span className="font-mono text-[10px] text-ink-mute">Operator</span>
            </span>
          </div>
        ) : null}
      </div>
    </header>
  )
}

function AdminNavPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { data: queue } = useDepositQueue()
  const logoutMutation = useLogout()
  const navigate = useNavigate()

  const shape =
    'flex min-h-11 items-center gap-3 rounded-input px-3 text-[13.5px] transition-colors duration-[120ms]'

  const signOut = async () => {
    await logoutMutation.mutateAsync()
    await navigate(adminPaths.login)
  }

  return (
    <nav aria-label="Console navigation" className="flex h-full flex-col p-2.5">
      <ul className="flex flex-col gap-0.5">
        {adminNav.map((item) => {
          const Icon = item.icon
          const count = item.badge === 'deposits' ? queue?.length : undefined

          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end ?? false}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className={({ isActive }) =>
                  cn(
                    shape,
                    isActive ? 'bg-accent/12 font-semibold text-accent' : 'text-ink-mute hover:text-ink',
                  )
                }
              >
                <Icon aria-hidden size={16} strokeWidth={1.5} />
                {item.label}
                {count ? (
                  <span className="ml-auto rounded-full bg-warning px-1.5 py-px font-mono text-[11px] font-semibold text-on-accent">
                    {count}
                  </span>
                ) : null}
              </NavLink>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2.5">
        <NavLink
          to={adminPaths.settings}
          {...(onNavigate ? { onClick: onNavigate } : {})}
          className={({ isActive }) =>
            cn(shape, isActive ? 'bg-accent/12 text-accent' : 'text-ink-mute hover:text-ink')
          }
        >
          <Settings aria-hidden size={16} strokeWidth={1.5} />
          Settings
        </NavLink>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={logoutMutation.isPending}
          className={cn(shape, 'w-full text-ink-mute hover:text-ink')}
        >
          <LogOut aria-hidden size={16} strokeWidth={1.5} />
          Sign out
        </button>
      </div>
    </nav>
  )
}
