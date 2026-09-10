import { Bell, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { IconButton } from '@/components/ui/Button'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { useMarkNotificationsRead, useNotifications } from '@/features/wallet'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/format'
import { money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function NotificationsPanel() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: notifications } = useNotifications()
  const markRead = useMarkNotificationsRead()

  const unread = notifications?.some((notification) => !notification.read) ?? false

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

  return (
    <div ref={containerRef} className="relative">
      <IconButton label="Notifications" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell aria-hidden size={18} strokeWidth={1.5} />
        {unread ? (
          <span className="absolute top-2 right-2 size-2 rounded-full border-2 border-surface-2 bg-highlight" />
        ) : null}
      </IconButton>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-line-strong bg-surface-1 shadow-e2">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-display text-[15px] font-semibold">Notifications</span>
            <button
              type="button"
              onClick={() => markRead.mutate()}
              className="min-h-11 text-[12.5px] text-accent hover:underline"
            >
              Mark all read
            </button>
          </header>

          <ul className="max-h-80 overflow-y-auto">
            {notifications?.map((notification) => (
              <li
                key={notification.id}
                className={cn(
                  'flex gap-3 border-b border-line/60 px-4 py-3 last:border-b-0',
                  !notification.read && 'bg-accent/5',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    notification.read ? 'bg-transparent' : 'bg-accent',
                  )}
                />
                <div className="flex flex-col gap-1">
                  <span
                    className={cn(
                      'text-[13.5px] leading-snug',
                      notification.read ? 'text-ink-mute' : 'text-ink',
                    )}
                  >
                    {notification.message}
                    {notification.amount_minor !== null && notification.currency ? (
                      <>
                        {' — '}
                        <MoneyDisplay
                          value={money(notification.amount_minor, notification.currency)}
                          tone="auto"
                          sign="always"
                          className="text-[13.5px]"
                        />
                      </>
                    ) : null}
                  </span>
                  <span className="font-mono text-[11px] text-ink-mute">
                    {formatRelative(notification.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <Link
            to={paths.history}
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-center gap-1 border-t border-line text-[12.5px] text-accent hover:underline"
          >
            See all in History
            <ChevronRight aria-hidden size={14} strokeWidth={1.5} />
          </Link>
        </div>
      ) : null}
    </div>
  )
}
