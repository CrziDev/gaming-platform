import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import type { User } from '@/api/types'
import { useLogout } from '@/features/auth'
import { paths } from '@/routes/paths'

const itemClass =
  'flex min-h-11 w-full items-center gap-2.5 rounded-input px-3 text-[13px] text-ink-mute transition-colors duration-[120ms] hover:bg-wash hover:text-ink-soft lg:min-h-9'

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
        className="flex min-h-11 items-center gap-2 rounded-chip py-1 pr-2 pl-1 text-ink-soft transition-colors duration-[120ms] hover:bg-wash lg:min-h-8"
      >
        <span
          aria-hidden
          className="flex size-[26px] items-center justify-center rounded-full bg-surface-3 font-mono text-[10.5px] font-medium text-ink-mute uppercase"
        >
          {initials(user.display_name)}
        </span>
        <span aria-hidden className="hidden text-[13px] font-medium sm:inline">
          {surname(user.display_name)}
        </span>
        <ChevronDown aria-hidden size={12} strokeWidth={2.2} className="text-ink-mute" />
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-1.5 w-56 rounded-card bg-surface-2 p-1">
          <div className="px-3 pt-2 pb-2.5">
            <p className="truncate text-[13px] font-medium text-ink-soft">{user.display_name}</p>
            <p className="truncate text-[12px] text-ink-mute">{user.email}</p>
          </div>
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

function surname(displayName: string): string {
  const words = displayName.trim().split(/\s+/)
  return words[words.length - 1] ?? displayName
}

function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0]?.charAt(0) ?? ''}${words[words.length - 1]?.charAt(0) ?? ''}`
  }
  return displayName.slice(0, 2)
}
