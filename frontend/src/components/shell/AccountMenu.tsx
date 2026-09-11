import { LogOut, User as UserIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import type { User } from '@/api/types'
import { useLogout } from '@/features/auth'
import { paths } from '@/routes/paths'

export function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const logoutMutation = useLogout()
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const signOut = async () => {
    await logoutMutation.mutateAsync()
    setOpen(false)
    await navigate(paths.lobby)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex size-11 items-center justify-center lg:size-9"
      >
        <span className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-line font-mono text-[13px] font-semibold text-ink uppercase lg:size-8 lg:text-[12px]">
          {user.display_name.slice(0, 2)}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-card border border-line-strong bg-surface-1 shadow-e2">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{user.display_name}</p>
            <p className="truncate text-[12px] text-ink-mute">{user.email}</p>
          </div>
          <Link
            to={paths.account}
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2.5 px-4 text-[13.5px] text-ink-mute hover:text-ink"
          >
            <UserIcon aria-hidden size={16} strokeWidth={1.5} />
            Account
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={logoutMutation.isPending}
            className="flex min-h-11 w-full items-center gap-2.5 border-t border-line px-4 text-[13.5px] text-ink-mute hover:text-ink"
          >
            <LogOut aria-hidden size={16} strokeWidth={1.5} />
            {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
