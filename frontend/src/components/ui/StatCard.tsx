import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type StatTone = 'default' | 'warning' | 'danger' | 'success'

const tones: Record<StatTone, { frame: string; label: string }> = {
  default: { frame: 'border-line bg-surface-1', label: 'text-ink-mute' },
  warning: { frame: 'border-warning/35 bg-warning/6', label: 'text-warning' },
  danger: { frame: 'border-danger/35 bg-danger/6', label: 'text-danger' },
  success: { frame: 'border-success/35 bg-success/6', label: 'text-success' },
}

type StatCardProps = {
  label: string
  value: ReactNode
  meta?: ReactNode
  tone?: StatTone
  className?: string
}

export function StatCard({ label, value, meta, tone = 'default', className }: StatCardProps) {
  const style = tones[tone]

  return (
    <div className={cn('flex flex-col gap-1.5 rounded-card border p-4', style.frame, className)}>
      <span className={cn('label-mono', style.label)}>{label}</span>
      <span className="font-mono text-[22px] leading-tight font-semibold tnum">{value}</span>
      {meta ? <span className="text-[12.5px] text-ink-mute">{meta}</span> : null}
    </div>
  )
}
