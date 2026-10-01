import { Info } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

type HelpTipProps = {
  subject: string
  children: ReactNode
}

// Sits in the top-right corner of a `relative` parent and explains it. Hover and
// focus show the tip; a tap pins it, because touch has no hover.
export function HelpTip({ subject, children }: HelpTipProps) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || pinned

  useEffect(() => {
    if (!pinned) return
    const release = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node)) {
        setPinned(false)
        setHovered(false)
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false)
        setHovered(false)
      }
    }
    document.addEventListener('pointerdown', release)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', release)
      document.removeEventListener('keydown', escape)
    }
  }, [pinned])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`About ${subject}`}
        aria-describedby={id}
        aria-controls={id}
        aria-expanded={open}
        onClick={() => setPinned((value) => !value)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={cn(
          'absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-input text-ink-mute lg:top-2 lg:right-2 lg:size-8',
          'transition-colors duration-fast ease-standard hover:bg-wash hover:text-ink-soft',
          open && 'text-ink-soft',
        )}
      >
        <Info aria-hidden className="size-3.5" strokeWidth={1.5} />
      </button>
      <span
        role="tooltip"
        id={id}
        className={cn(
          'glass-menu pointer-events-none absolute top-10 right-3 left-3 z-10 rounded-input px-3 py-2.5 text-[12.5px] leading-snug text-ink-soft text-pretty',
          'transition-opacity duration-fast ease-standard motion-reduce:transition-none',
          open ? 'opacity-100' : 'opacity-0',
        )}
      >
        {children}
      </span>
    </>
  )
}
