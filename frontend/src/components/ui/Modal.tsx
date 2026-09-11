import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

const focusable =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export type ModalSize = 'sm' | 'md' | 'lg'

const sizes: Record<ModalSize, string> = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[440px]',
  lg: 'sm:max-w-[560px]',
}

type ModalProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  size?: ModalSize
  footer?: ReactNode
  children: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>(focusable)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') {
        return
      }

      const targets = panelRef.current?.querySelectorAll<HTMLElement>(focusable)
      if (!targets || targets.length === 0) {
        return
      }

      const first = targets[0]
      const last = targets[targets.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[#06090f]/72"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col rounded-t-sheet border border-line-strong bg-surface-1 sm:max-h-[calc(100dvh-3rem)]',
          'shadow-e2 sm:rounded-sheet',
          sizes[size],
        )}
      >
        <header className="flex items-start gap-4 px-5 pt-5 pb-4 lg:pt-4 lg:pb-3">
          <div className="flex flex-1 flex-col gap-1">
            <h2 id={titleId} className="font-display text-xl font-semibold text-ink lg:text-lg">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-[13.5px] leading-relaxed text-ink-mute">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close" onClick={onClose} className="rounded-full">
            <X aria-hidden size={16} strokeWidth={1.5} />
          </IconButton>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer ? <footer className="border-t border-line px-5 py-3.5">{footer}</footer> : null}
      </div>
    </div>
  )
}
