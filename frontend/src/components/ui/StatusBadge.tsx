import { cn } from '@/lib/cn'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'accent' | 'neutral' | 'muted'

const tones: Record<BadgeTone, string> = {
  success: 'text-success bg-success/12 border-success/30',
  warning: 'text-warning bg-warning/12 border-warning/30',
  danger: 'text-danger bg-danger/12 border-danger/30',
  accent: 'text-accent bg-accent/12 border-accent/30',
  neutral: 'text-ink-mute bg-ink-mute/10 border-ink-mute/28',
  muted: 'text-ink-faint bg-ink-faint/10 border-ink-faint/28',
}

const statusTones: Record<string, BadgeTone> = {
  active: 'success',
  approved: 'success',
  applied: 'success',
  won: 'success',
  maintenance: 'warning',
  pending: 'warning',
  review: 'warning',
  scheduled: 'warning',
  rejected: 'danger',
  suspended: 'danger',
  failed: 'danger',
  verified: 'accent',
  settled: 'neutral',
  draft: 'neutral',
  off: 'neutral',
  closed: 'muted',
  retired: 'muted',
}

export function toneForStatus(status: string): BadgeTone {
  return statusTones[status.toLowerCase()] ?? 'neutral'
}

type StatusBadgeProps = {
  status: string
  tone?: BadgeTone
  className?: string
}

export function StatusBadge({ status, tone, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] leading-none',
        'tracking-[0.08em] uppercase',
        tones[tone ?? toneForStatus(status)],
        className,
      )}
    >
      {status}
    </span>
  )
}
