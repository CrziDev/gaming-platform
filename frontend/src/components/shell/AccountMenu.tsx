import { LogOut, Receipt, User as UserIcon, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import type { User } from '@/api/types'
import { useLogout } from '@/features/auth'
import { cn } from '@/lib/cn'
import { paths } from '@/routes/paths'

const itemClass =
  'flex min-h-11 w-full items-center gap-2.5 rounded-chip px-3 text-[13.5px] text-ink-control transition-colors duration-fast hover:bg-white/7 hover:text-ink lg:min-h-10'

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
        title={user.display_name}
        className={cn(
          'glass-pill flex size-11 items-center justify-center rounded-full text-ink-soft transition-colors duration-fast hover:bg-white/8 sm:size-11.5',
          open && 'bg-white/8',
        )}
      >
        <svg aria-hidden width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="8" r="4.2" />
          <path d="M3.5 21c.6-4.4 4-7 8.5-7s7.9 2.6 8.5 7z" />
        </svg>
      </button>

      {open ? (
        <div className="pop-enter glass-menu absolute right-0 z-40 mt-2 w-56 rounded-card p-1.5">
          <div className="px-3 pt-2 pb-2.5">
            <p className="truncate text-[13px] font-medium text-ink-soft">{user.display_name}</p>
            <p className="truncate text-[12px] text-ink-mute">{user.email}</p>
          </div>
          <Link to={paths.wallet} onClick={() => setOpen(false)} className={itemClass}>
            <Wallet aria-hidden size={16} strokeWidth={1.5} />
            Wallet
          </Link>
          <Link to={paths.history} onClick={() => setOpen(false)} className={itemClass}>
            <Receipt aria-hidden size={16} strokeWidth={1.5} />
            History
          </Link>
          <Link to={paths.account} onClick={() => setOpen(false)} className={itemClass}>
            <UserIcon aria-hidden size={16} strokeWidth={1.5} />
            Account
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={logoutMutation.isPending}
            className={itemClass}
          >
            <LogOut aria-hidden size={16} strokeWidth={1.5} />
            {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
