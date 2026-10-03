import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import type { AdminRtpConfiguration, AdminRtpSlot } from '@/api/types'
import { ActiveRtp } from '@/components/admin/ActiveRtp'
import { Select } from '@/components/ui/Field'
import { Panel } from '@/components/ui/Panel'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useAdminGame, useAdminRtpConfiguration } from '@/features/admin'
import { cn } from '@/lib/cn'
import { formatPercent } from '@/lib/format'
import { adminPaths } from '@/routes/paths'

type Risk = 'low' | 'normal' | 'high'

const DEFAULT_ROWS = 10
const DEFAULT_RISK: Risk = 'normal'
const riskLabels: Record<Risk, string> = { low: 'Low', normal: 'Normal', high: 'High' }

export function AdminRtpConfigurationPage() {
  const { id = '' } = useParams()
  const gameQuery = useAdminGame(id)
  const [profileChoice, setProfileChoice] = useState<number | null>(null)
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [risk, setRisk] = useState<Risk>(DEFAULT_RISK)
  const game = gameQuery.data
  const profile = profileChoice ?? game?.rtp_basis_points ?? game?.rtp_options[0] ?? null
  const configurationQuery = useAdminRtpConfiguration(id, profile, rows, risk)

  if (gameQuery.isPending) return <SkeletonRows count={5} />
  if (gameQuery.isError) {
    return <ErrorState title="Game unavailable" message="The game could not be loaded." onRetry={() => void gameQuery.refetch()} />
  }
  if (!game) {
    return <EmptyState title="Game not found" action={<Link to={adminPaths.rtp} className="text-accent-ink">Back to RTP</Link>} />
  }
  if (game.rtp_options.length === 0 || profile === null) {
    return <EmptyState title="No RTP configuration" description="This game does not expose an inspectable engine configuration." />
  }

  const configuration = configurationQuery.data

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link to={adminPaths.rtp} className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-ink-mute hover:text-ink-soft">
          <ArrowLeft aria-hidden size={15} strokeWidth={1.5} />
          RTP <span aria-hidden className="hidden sm:inline">/ {game.name}</span>
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold tracking-[-0.02em] text-ink">{game.name} configuration</h1>
            <p className="mt-1 hidden text-[13.5px] text-ink-mute sm:block">
              Inspect the multiplier and chance for every possible landing slot.
            </p>
          </div>
          <PlayingNow basisPoints={game.rtp_basis_points} />
        </div>
      </header>

      <section aria-labelledby="rtp-profile-heading" className="flex flex-col gap-2.5">
        <div className="flex items-end justify-between gap-3">
          <h2 id="rtp-profile-heading" className="label-mono text-ink-cool">RTP profile</h2>
          <p className="hidden text-[12px] text-ink-mute sm:block">Viewing does not change the active RTP.</p>
        </div>
        <div className="hidden grid-cols-4 overflow-hidden rounded-input bg-surface-1 sm:grid">
          {game.rtp_options.map((option) => {
            const selected = option === profile
            const active = option === game.rtp_basis_points
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => setProfileChoice(option)}
                className={cn(
                  'min-h-12 border-r border-base px-3 text-[13px] tnum last:border-r-0 hover:bg-wash',
                  selected ? 'bg-wash text-ink' : 'text-ink-mute',
                )}
              >
                {formatPercent(option)} {active ? <span className="text-accent-ink">● NOW</span> : null}
              </button>
            )
          })}
        </div>
        <div className="sm:hidden">
          <Select aria-label="RTP profile" value={profile} onChange={(event) => setProfileChoice(Number(event.target.value))}>
            {game.rtp_options.map((option) => (
              <option key={option} value={option}>
                {formatPercent(option)}{option === game.rtp_basis_points ? ' — Playing now' : ''}
              </option>
            ))}
          </Select>
          <p className="mt-2 text-[12px] text-ink-mute">Viewing does not change the active RTP.</p>
        </div>
      </section>

      <BoardControls
        rows={configuration?.rows ?? Array.from({ length: 9 }, (_, index) => index + 8)}
        risks={configuration?.risks ?? ['low', 'normal', 'high']}
        selectedRows={rows}
        selectedRisk={risk}
        onRows={setRows}
        onRisk={setRisk}
      />

      {configurationQuery.isPending ? (
        <SkeletonRows count={4} />
      ) : configurationQuery.isError ? (
        <ErrorState
          title="Configuration unavailable"
          message="The selected board configuration could not be loaded."
          onRetry={() => void configurationQuery.refetch()}
        />
      ) : !configuration ? (
        <EmptyState title="Configuration not available" description="This engine does not expose configuration details." />
      ) : (
        <ConfigurationDetails configuration={configuration} />
      )}
    </div>
  )
}

function PlayingNow({ basisPoints }: { basisPoints: number | null }) {
  return (
    <div role="status" aria-label="Current RTP" className="flex items-center gap-2 rounded-full bg-accent/8 px-3 py-1.5 text-[12px] text-ink-mute">
      <span aria-hidden className="text-[9px] text-accent-ink">●</span>
      Playing at <ActiveRtp basisPoints={basisPoints} />
    </div>
  )
}

function BoardControls({
  rows,
  risks,
  selectedRows,
  selectedRisk,
  onRows,
  onRisk,
}: {
  rows: number[]
  risks: Risk[]
  selectedRows: number
  selectedRisk: Risk
  onRows: (rows: number) => void
  onRisk: (risk: Risk) => void
}) {
  return (
    <section aria-labelledby="board-heading" className="flex flex-col gap-2.5">
      <h2 id="board-heading" className="label-mono text-ink-cool">Board</h2>
      <div className="hidden flex-wrap items-center gap-x-6 gap-y-3 sm:flex">
        <div className="flex items-center gap-2" role="group" aria-label="Rows">
          <span className="mr-1 text-[12.5px] font-medium text-ink-mute">Rows</span>
          {rows.map((value) => (
            <ChoiceButton key={value} selected={value === selectedRows} onClick={() => onRows(value)}>{value}</ChoiceButton>
          ))}
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Risk">
          <span className="mr-1 text-[12.5px] font-medium text-ink-mute">Risk</span>
          {risks.map((value) => (
            <ChoiceButton key={value} selected={value === selectedRisk} onClick={() => onRisk(value)}>{riskLabels[value]}</ChoiceButton>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:hidden">
        <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-ink-mute">
          Rows
          <Select aria-label="Rows" value={selectedRows} onChange={(event) => onRows(Number(event.target.value))}>
            {rows.map((value) => <option key={value} value={value}>{value} rows</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-ink-mute">
          Risk
          <Select aria-label="Risk" value={selectedRisk} onChange={(event) => onRisk(event.target.value as Risk)}>
            {risks.map((value) => <option key={value} value={value}>{riskLabels[value]}</option>)}
          </Select>
        </label>
      </div>
    </section>
  )
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'min-h-9 min-w-9 rounded-chip bg-inset px-3 text-[12.5px] font-medium hover:bg-wash',
        selected ? 'bg-accent/14 text-accent-ink' : 'text-ink-mute',
      )}
    >
      {children}
    </button>
  )
}

function ConfigurationDetails({ configuration }: { configuration: AdminRtpConfiguration }) {
  const board = configuration.selected_board
  const total = board.slots.reduce((sum, slot) => sum + slot.chance_thousandths_percent, 0)
  return (
    <div className="flex flex-col gap-5">
      <Panel title="Summary" bodyClassName="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <SummaryValue label="Target RTP" value={formatPercent(configuration.rtp_basis_points)} />
        <SummaryValue label="Theoretical RTP" value={formatPercent(board.theoretical_rtp_basis_points)} />
        <SummaryValue label="Outcomes" value={`${board.slots.length} slots`} />
        <SummaryValue label="Reference" value={configuration.configuration_ref} mono />
      </Panel>

      <ChanceChart slots={board.slots} />
      <ExactTable slots={board.slots} total={total} />
      <MobileOutcomes slots={board.slots} total={total} />
    </div>
  )
}

function SummaryValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11.5px] text-ink-mute">{label}</p>
      <p className={cn('mt-1 text-[14px] font-medium text-ink tnum', mono && 'font-mono text-[12px]')}>{value}</p>
    </div>
  )
}

function ChanceChart({ slots }: { slots: AdminRtpSlot[] }) {
  const highest = Math.max(...slots.map((slot) => slot.chance_thousandths_percent))
  return (
    <Panel title="Chance distribution" className="hidden wide:block" bodyClassName="pt-5">
      <figure aria-label="Chance distribution by landing slot">
        <div className="flex h-60 items-end gap-1 border-b border-surface-3 px-1">
          {slots.map((slot) => (
            <div key={slot.slot} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] text-ink-mute tnum">{formatChance(slot.chance_thousandths_percent)}</span>
              <div
                aria-hidden
                className="w-full max-w-12 rounded-t-sm bg-accent/65"
                style={{ height: `${Math.max(3, (slot.chance_thousandths_percent / highest) * 190)}px` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1 px-1">
          {slots.map((slot) => (
            <div key={slot.slot} className="min-w-0 flex-1 text-center">
              <p className="font-mono text-[10px] text-ink-mute">{slot.slot}</p>
              <p className="mt-1 font-mono text-[11px] font-medium text-ink-soft">{formatMultiplier(slot.multiplier_hundredths)}</p>
            </div>
          ))}
        </div>
        <figcaption className="sr-only">Each bar shows the normalized chance of the ball landing in that slot.</figcaption>
      </figure>
    </Panel>
  )
}

function ExactTable({ slots, total }: { slots: AdminRtpSlot[]; total: number }) {
  return (
    <Panel title="Exact values" className="hidden wide:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Exact multiplier and chance for every landing slot</caption>
        <tbody>
          <ValueRow label="Slot" slots={slots} render={(slot) => String(slot.slot)} />
          <ValueRow label="Multiplier" slots={slots} render={(slot) => formatMultiplier(slot.multiplier_hundredths)} />
          <ValueRow label="Chance" slots={slots} render={(slot) => formatChance(slot.chance_thousandths_percent)} />
        </tbody>
        <tfoot>
          <tr className="border-t border-surface-3">
            <th scope="row" className="pt-3 text-[12px] font-medium text-ink-mute">Total chance</th>
            <td colSpan={slots.length} className="pt-3 text-right font-mono text-[12px] font-medium text-ink">{formatChance(total)}</td>
          </tr>
        </tfoot>
      </table>
    </Panel>
  )
}

function ValueRow({ label, slots, render }: { label: string; slots: AdminRtpSlot[]; render: (slot: AdminRtpSlot) => string }) {
  return (
    <tr className="border-b border-surface-3 last:border-b-0">
      <th scope="row" className="py-2.5 pr-5 text-[12px] font-medium text-ink-mute">{label}</th>
      {slots.map((slot) => <td key={slot.slot} className="px-2 py-2.5 text-center text-[11px] text-ink-soft tnum">{render(slot)}</td>)}
    </tr>
  )
}

function MobileOutcomes({ slots, total }: { slots: AdminRtpSlot[]; total: number }) {
  return (
    <section aria-labelledby="slot-outcomes-heading" className="wide:hidden">
      <h2 id="slot-outcomes-heading" className="label-mono mb-2.5 text-ink-cool">Slot outcomes</h2>
      <div className="overflow-hidden rounded-card glass-panel">
        <ul>
          {slots.map((slot) => (
            <li key={slot.slot} className="grid grid-cols-[1fr_auto_auto] gap-5 border-b border-surface-3 px-4 py-3 text-[12.5px]">
              <span className="text-ink-mute">Slot {slot.slot}</span>
              <span className="font-mono font-medium text-ink-soft">{formatMultiplier(slot.multiplier_hundredths)}</span>
              <span className="w-18 text-right text-ink tnum">{formatChance(slot.chance_thousandths_percent)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between px-4 py-3 text-[12.5px] font-medium">
          <span className="text-ink-mute">Total chance</span>
          <span className="text-ink tnum">{formatChance(total)}</span>
        </div>
      </div>
    </section>
  )
}

function formatChance(thousandthsPercent: number): string {
  return `${(thousandthsPercent / 1_000).toFixed(3)}%`
}

function formatMultiplier(hundredths: number): string {
  const whole = Math.trunc(hundredths / 100)
  const fraction = hundredths % 100
  if (fraction === 0) return `${whole}×`
  return `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}×`
}
