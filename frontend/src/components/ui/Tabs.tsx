import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'

export type TabItem<T extends string> = {
  id: T
  label: string
  icon?: LucideIcon | undefined
  count?: number | undefined
}

type TabsProps<T extends string> = {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}

export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: TabsProps<T>) {
  return (
    <div className={cn('border-b border-line', className)}>
      <div role="tablist" aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = item.id === value
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.id)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3.5 text-sm lg:min-h-10',
                'transition-colors duration-[120ms] ease-standard',
                active
                  ? 'border-accent font-semibold text-accent'
                  : 'border-transparent text-ink-mute hover:text-ink',
              )}
            >
              {Icon ? <Icon aria-hidden size={16} strokeWidth={1.5} /> : null}
              {item.label}
              {item.count === undefined ? null : (
                <span className="font-mono text-[11px] text-ink-faint">{item.count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SegmentedTrack<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-input border border-line bg-base p-1',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-chip px-3.5 text-[13px] lg:min-h-10',
              'transition-colors duration-[120ms] ease-standard',
              active
                ? 'bg-surface-2 font-semibold text-ink shadow-e1'
                : 'text-ink-mute hover:text-ink',
            )}
          >
            {item.label}
            {item.count === undefined ? null : (
              <span className="font-mono text-[11px] text-ink-faint">{item.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
