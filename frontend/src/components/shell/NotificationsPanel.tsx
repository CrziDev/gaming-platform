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
        <Bell aria-hidden size={17} strokeWidth={1.6} />
        {unread ? (
          <span className="absolute top-2.5 right-2.5 size-[5px] rounded-full bg-danger lg:top-1.5 lg:right-[7px]" />
        ) : null}
      </IconButton>

      {open ? (
        <div className="absolute right-0 z-40 mt-1.5 w-[min(22rem,calc(100vw-2rem))] rounded-card bg-surface-2 p-1">
          <header className="flex items-center justify-between px-3 pt-2 pb-1.5">
            <span className="text-[13px] font-semibold text-ink-soft">Notifications</span>
            <button
              type="button"
              onClick={() => markRead.mutate()}
              className="min-h-11 text-[12px] font-medium text-accent-ink hover:text-accent-hi lg:min-h-8"
            >
              Mark all read
            </button>
          </header>

          <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            {notifications?.map((notification) => (
              <li
                key={notification.id}
                className={cn(
                  'flex gap-2.5 rounded-input px-3 py-2.5',
                  !notification.read && 'bg-wash',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 size-[5px] shrink-0 rounded-full',
                    notification.read ? 'bg-transparent' : 'bg-accent-ink',
                  )}
                />
                <div className="flex flex-col gap-1">
                  <span
                    className={cn(
                      'text-[13px] leading-snug',
                      notification.read ? 'text-ink-mute' : 'text-ink-soft',
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
                          className="text-[13px]"
                        />
                      </>
                    ) : null}
                  </span>
                  <span className="font-mono text-[10.5px] text-ink-mute">
                    {formatRelative(notification.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <Link
            to={paths.history}
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-11 items-center justify-center gap-1 rounded-input text-[12.5px] font-medium text-accent-ink transition-colors duration-[120ms] hover:bg-wash lg:min-h-9"
          >
            See all in History
            <ChevronRight aria-hidden size={14} strokeWidth={1.5} />
          </Link>
        </div>
      ) : null}
    </div>
  )
}
