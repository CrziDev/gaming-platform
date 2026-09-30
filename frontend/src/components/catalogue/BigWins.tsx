import { Trophy } from 'lucide-react'

import { StatusBadge } from '@/components/ui/StatusBadge'

const placeholderCount = 6

export function BigWins() {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">
          <Trophy aria-hidden size={15} strokeWidth={1.6} className="text-ink-mute" />
          Big wins
        </h2>
        <StatusBadge status="Future Development" />
      </div>

      <ul
        aria-label="Big wins"
        tabIndex={0}
        className="scrollbar-hidden -mx-3.5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3.5"
      >
        {Array.from({ length: placeholderCount }, (_, index) => (
          <li key={index} className="w-[172px] shrink-0 snap-start">
            <div aria-hidden className="flex items-center gap-2 edge-lit rounded-tile bg-surface-1 py-1.5 pr-[9px] pl-1.5">
              <span className="size-[34px] shrink-0 rounded-chip bg-surface-3" />
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="h-2.5 w-16 rounded-chip bg-surface-3" />
                <span className="h-3 w-20 rounded-chip bg-surface-3" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
