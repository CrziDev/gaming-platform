import { SegmentedTrack } from '@/components/ui/Tabs'
import { cn } from '@/lib/cn'

import { PLINKO_RISKS, PLINKO_ROWS, type PlinkoParams, type PlinkoRisk, type PlinkoRows } from './multipliers'

export type GameControlsProps<P> = {
  params: P
  onChange: (params: P) => void
  disabled: boolean
}

const riskLabels: Record<PlinkoRisk, string> = { low: 'Low', normal: 'Normal', high: 'High' }

export function PlinkoControls({ params, onChange, disabled }: GameControlsProps<PlinkoParams>) {
  const setRows = (rows: PlinkoRows) => !disabled && onChange({ ...params, rows })
  const setRisk = (risk: PlinkoRisk) => !disabled && onChange({ ...params, risk })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="label-mono text-ink-mute">Rows</span>
          {disabled ? <span className="font-mono text-[11px] text-ink-mute">locked while a ball falls</span> : null}
        </div>
        <div
          role="radiogroup"
          aria-label="Rows"
          className="grid grid-cols-9 gap-0.5 rounded-input bg-inset p-0.5"
        >
          {PLINKO_ROWS.map((rows) => {
            const active = rows === params.rows
            return (
              <button
                key={rows}
                type="button"
                role="radio"
                aria-checked={active}
                aria-disabled={disabled || undefined}
                onClick={() => setRows(rows)}
                className={cn(
                  'inline-flex min-h-10 items-center justify-center rounded-[7px] font-mono text-[12.5px] font-medium tnum lg:min-h-[26px]',
                  'transition-colors duration-fast ease-standard',
                  active ? 'bg-wash text-ink-soft' : 'text-ink-mute hover:text-ink-soft',
                  disabled && 'cursor-not-allowed hover:text-ink-mute',
                )}
              >
                {rows}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="label-mono text-ink-mute">Risk</span>
        <SegmentedTrack
          items={PLINKO_RISKS.map((risk) => ({ id: risk, label: riskLabels[risk] }))}
          value={params.risk}
          onChange={setRisk}
          label="Risk"
          disabled={disabled}
          className="grid w-full grid-cols-3"
        />
      </div>
    </div>
  )
}
