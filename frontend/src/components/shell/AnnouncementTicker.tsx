import { Megaphone } from 'lucide-react'
import type { CSSProperties } from 'react'

import { useAnnouncements } from '@/features/announcement'

export function AnnouncementTicker() {
  const announcementsQuery = useAnnouncements()
  const items = announcementsQuery.data ?? []

  if (announcementsQuery.isPending || announcementsQuery.isError || items.length === 0) {
    return null
  }

  const duration = Math.max(7, items.reduce((total, item) => total + Array.from(item.text).length, 0) / 20)
  const style = { '--announcement-duration': `${duration}s` } as CSSProperties

  return (
    <section
      aria-label="Announcements"
      className="announcement-ticker absolute inset-x-0 top-0 z-20 flex h-10 min-w-0 overflow-hidden bg-surface-1/20"
    >
      <div className="flex w-10 shrink-0 items-center justify-center bg-surface-2/20 text-ink-mute">
        <Megaphone aria-hidden size={16} strokeWidth={1.5} />
      </div>
      <ul className="sr-only">
        {items.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
      <div className="announcement-marquee min-w-0 flex-1" aria-hidden>
        <div className="announcement-track min-h-10 items-center" style={style}>
          <AnnouncementSequence items={items} />
        </div>
      </div>
    </section>
  )
}

function AnnouncementSequence({ items }: { items: Array<{ id: string; text: string }> }) {
  return (
    <span className="announcement-group flex shrink-0 items-center whitespace-nowrap pr-8 text-[13px] text-ink-soft">
      {items.map((item, index) => (
        <span key={item.id} className="flex items-center">
          {index > 0 ? <span className="mx-5 text-ink-mute">•</span> : null}
          {item.text}
        </span>
      ))}
    </span>
  )
}
