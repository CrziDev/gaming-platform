import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { HelpTip } from './HelpTip'

export type StatTone = 'default' | 'warning' | 'danger' | 'success'

const tones: Record<StatTone, { frame: string; label: string }> = {
  default: { frame: 'glass-panel', label: 'text-ink-mute' },
  warning: { frame: 'bg-warning/12', label: 'text-warning' },
  danger: { frame: 'bg-danger/12', label: 'text-danger' },
  success: { frame: 'bg-success/12', label: 'text-success' },
}

type StatCardProps = {
  label: string
  value: ReactNode
  meta?: ReactNode
  help?: ReactNode
  tone?: StatTone
  className?: string
}

export function StatCard({ label, value, meta, help, tone = 'default', className }: StatCardProps) {
  const style = tones[tone]

  return (
    <div className={cn('relative flex flex-col gap-1.5 rounded-card p-4', style.frame, className)}>
      <span className={cn('label-mono', style.label, help ? 'pr-8' : null)}>{label}</span>
      <span className="text-[21px] leading-tight font-medium text-ink tnum">{value}</span>
      {meta ? <span className="text-[12px] text-ink-mute">{meta}</span> : null}
      {help ? <HelpTip subject={label}>{help}</HelpTip> : null}
    </div>
  )
}
