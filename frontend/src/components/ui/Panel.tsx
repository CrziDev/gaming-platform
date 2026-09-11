import { ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

type PanelProps = {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function Panel({ title, action, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={cn('rounded-card bg-surface-1', className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-1">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

type CollapsiblePanelProps = PanelProps & {
  title: ReactNode
  defaultOpen?: boolean
}

export function CollapsiblePanel({
  title,
  action,
  children,
  className,
  bodyClassName,
  defaultOpen = false,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()

  return (
    <section className={cn('rounded-card bg-surface-1', className)}>
      <div className="flex items-center gap-2 px-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-11 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink-soft">{title}</span>
          <ChevronDown
            aria-hidden
            size={16}
            strokeWidth={1.5}
            className={cn('text-ink-mute', open && 'rotate-180')}
          />
        </button>
        {action}
      </div>
      <div id={bodyId} hidden={!open} className={cn('px-4 pb-4', bodyClassName)}>
        {children}
      </div>
    </section>
  )
}
