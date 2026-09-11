import { cn } from '@/lib/cn'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'accent' | 'neutral'

const tones: Record<BadgeTone, string> = {
  success: 'text-success bg-success/12',
  warning: 'text-warning bg-warning/12',
  danger: 'text-danger bg-danger/12',
  accent: 'text-accent-ink bg-accent-ink/12',
  neutral: 'text-ink-mute bg-wash',
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
        'inline-flex items-center rounded-chip px-2 py-1 font-mono text-[10px] leading-none font-medium',
        'tracking-[0.1em] uppercase',
        tones[tone ?? toneForStatus(status)],
        className,
      )}
    >
      {status}
    </span>
  )
}
