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

export function ChipTabs<T extends string>({ items, value, onChange, label, className }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn('scrollbar-hidden flex gap-1.5 overflow-x-auto', className)}>
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
              'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-chip px-3 text-[12.5px] font-medium whitespace-nowrap lg:min-h-8',
              'transition-colors duration-[120ms] ease-standard',
              active ? 'bg-surface-3 text-ink-soft' : 'text-ink-mute hover:bg-wash hover:text-ink-soft',
            )}
          >
            {Icon ? <Icon aria-hidden size={15} strokeWidth={1.5} /> : null}
            {item.label}
            {item.count === undefined ? null : (
              <span className="font-mono text-[11px] font-normal text-ink-mute">{item.count}</span>
            )}
          </button>
        )
      })}
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
      className={cn('scrollbar-hidden inline-flex max-w-full gap-0.5 overflow-x-auto rounded-input bg-inset p-0.5', className)}
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
              'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[7px] px-3 text-[12.5px] font-medium whitespace-nowrap lg:min-h-[26px]',
              'transition-colors duration-[120ms] ease-standard',
              active ? 'bg-wash text-ink-soft' : 'text-ink-mute hover:text-ink-soft',
            )}
          >
            {item.label}
            {item.count === undefined ? null : (
              <span className="font-mono text-[11px] font-normal text-ink-mute">{item.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
