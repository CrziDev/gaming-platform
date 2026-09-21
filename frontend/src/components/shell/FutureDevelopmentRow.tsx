import type { LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/cn'

import { railLabel, railRow, type RailMode } from './rail'

type Placement = 'right' | 'above'

type Phase = 'closed' | 'open' | 'closing'

type FutureDevelopmentRowProps = {
  icon: LucideIcon
  label: string
  mode?: RailMode
  placement: Placement
}

const exitMs = 180
const dwellMs = 2400

const slideFrom: Record<Placement, string> = {
  right: '-6px 0',
  above: '0 6px',
}

function noticeStyle(rect: DOMRect, placement: Placement): CSSProperties {
  if (placement === 'right') {
    return { left: rect.right + 8, top: rect.top, height: rect.height }
  }
  return { left: rect.left, bottom: window.innerHeight - rect.top + 6 }
}

// A rail row for a destination that does not exist yet. Tapping it answers with a
// transient notice beside the row instead of navigating; the notice is portalled and
// fixed because the rail clips anything positioned outside its scroll box.
export function FutureDevelopmentRow({ icon: Icon, label, mode = 'expanded', placement }: FutureDevelopmentRowProps) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [phase, setPhase] = useState<Phase>('closed')
  const [style, setStyle] = useState<CSSProperties>({})
  const open = phase === 'open'

  useEffect(() => {
    if (phase !== 'open') return
    const close = () => setPhase('closing')
    const release = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const dwell = window.setTimeout(close, dwellMs)
    document.addEventListener('pointerdown', release)
    document.addEventListener('keydown', escape)
    return () => {
      window.clearTimeout(dwell)
      document.removeEventListener('pointerdown', release)
      document.removeEventListener('keydown', escape)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'closing') return
    const unmount = window.setTimeout(() => setPhase('closed'), exitMs)
    return () => window.clearTimeout(unmount)
  }, [phase])

  const toggle = () => {
    if (open) {
      setPhase('closing')
      return
    }
    const rect = trigger.current?.getBoundingClientRect()
    if (rect) setStyle(noticeStyle(rect, placement))
    setPhase('open')
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-describedby={open ? id : undefined}
        {...(mode === 'expanded' ? {} : { title: label })}
        onClick={toggle}
        className={cn(
          'flex min-h-11 w-full items-center gap-2.75 rounded-input px-2.75 text-[13.5px] text-ink-mute lg:min-h-9',
          'transition-colors duration-fast ease-standard hover:bg-wash hover:text-ink-soft',
          open && 'bg-wash text-ink-soft',
          railRow[mode],
        )}
      >
        <Icon aria-hidden size={17} strokeWidth={1.5} className="shrink-0" />
        <span
          className={cn(
            'overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-standard ease-standard motion-reduce:transition-none',
            railLabel[mode],
          )}
        >
          {label}
        </span>
      </button>
      {phase === 'closed'
        ? null
        : createPortal(
            <span
              role="tooltip"
              id={id}
              style={{ ...style, '--pop-from': slideFrom[placement] } as CSSProperties}
              className={cn(
                'pointer-events-none fixed z-60 flex items-center rounded-input bg-surface-2 px-3 py-2 text-[13px] whitespace-nowrap text-ink-soft',
                phase === 'open' ? 'pop-enter' : 'pop-exit',
              )}
            >
              Future development
            </span>,
            document.body,
          )}
    </>
  )
}
