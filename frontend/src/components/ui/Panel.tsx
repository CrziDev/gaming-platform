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
    <section className={cn('rounded-card border border-line bg-surface-1', className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="font-display text-[17px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
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
    <section className={cn('rounded-card border border-line bg-surface-1', className)}>
      <div className="flex items-center gap-2 px-5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-12 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="font-display text-[17px] font-semibold text-ink">{title}</span>
          <ChevronDown
            aria-hidden
            size={18}
            strokeWidth={1.5}
            className={cn(
              'text-ink-mute transition-transform duration-[200ms] ease-standard',
              open && 'rotate-180',
            )}
          />
        </button>
        {action}
      </div>
      <div id={bodyId} hidden={!open} className={cn('border-t border-line p-5', bodyClassName)}>
        {children}
      </div>
    </section>
  )
}
