import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import { formatMultiplier } from '@/lib/format'

import {
  PLINKO_BOARD_ROWS,
  PLINKO_RISKS,
  riskLabels,
  summarizePlinko,
  type PlinkoBoard,
  type PlinkoParams,
  type PlinkoRisk,
} from './multipliers'

export type GameControlsProps<P> = {
  params: P
  onChange: (params: P) => void
  disabled: boolean
  board: PlinkoBoard | null
}

export function RiskMenu({ params, onChange, disabled, board }: GameControlsProps<PlinkoParams>) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (risk: PlinkoRisk) => {
    setOpen(false)
    if (!disabled) onChange({ ...params, risk })
  }

  return (
    <div ref={containerRef} className="relative shrink-0 game-side:w-full">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-part="risk-button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="tap-target flex h-10 items-center gap-2 rounded-input border border-hairline bg-inset pr-2 pl-3 text-[13.5px] whitespace-nowrap text-ink-control transition-colors duration-fast ease-standard hover:bg-wash disabled:cursor-not-allowed disabled:opacity-55 sm:h-10.5 game-side:w-full"
      >
        <SlidersHorizontal aria-hidden size={18} strokeWidth={1.8} className="max-[429px]:hidden" />
        <span className="game-side:flex-1 game-side:text-left">{summarizePlinko(params)}</span>
        <span aria-hidden data-part="risk-rule" className="h-5.5 w-px bg-hairline" />
        <ChevronDown
          aria-hidden
          size={16}
          strokeWidth={2.2}
          className={cn('transition-transform duration-standard ease-standard motion-reduce:transition-none', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Risk"
          data-part="risk-menu"
          className="pop-enter glass-menu absolute right-0 bottom-[calc(100%+8px)] z-20 flex w-52 flex-col gap-0.5 rounded-input p-1.5"
        >
          <div data-part="risk-menu-head" className="px-2.5 pt-1.5 pb-1 font-mono text-[10px] tracking-[0.14em] text-ink-mute">
            RISK · {PLINKO_BOARD_ROWS} ROWS
          </div>
          {PLINKO_RISKS.map((risk) => {
            const payouts = board?.[risk]
            return (
              <button
                key={risk}
                type="button"
                role="menuitemradio"
                aria-checked={risk === params.risk}
                data-part="risk-item"
                onClick={() => choose(risk)}
                className={cn(
                  'flex h-10 items-center justify-between rounded-chip px-2.5 text-left text-[13.5px] text-ink-soft transition-colors duration-fast hover:bg-wash',
                  risk === params.risk && 'bg-selected',
                )}
              >
                <span>{riskLabels[risk]}</span>
                {payouts ? (
                  <span data-part="risk-range" className="text-[11px] text-ink-mute tnum">
                    {formatMultiplier(Math.min(...payouts))} – {formatMultiplier(Math.max(...payouts))}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
