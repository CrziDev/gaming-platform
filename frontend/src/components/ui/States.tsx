import type { ReactNode } from 'react'

import { Button } from '@/components/ui/Button'

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface-1 px-6 py-12 text-center">
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-[42ch] text-sm text-ink-mute">{description}</p> : null}
      {action}
    </div>
  )
}

type ErrorStateProps = {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-card border border-danger/35 bg-danger/6 px-6 py-8">
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      <p role="alert" className="text-sm text-ink-soft">
        {message}
      </p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
