import type { ReactNode } from 'react'

import { Button } from '@/components/ui/Button'

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface-1 px-6 py-10 text-center">
      <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</p>
      {description ? (
        <p className="max-w-[42ch] text-[13.5px] text-ink-mute text-pretty">{description}</p>
      ) : null}
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
    <div className="flex flex-col items-start gap-3 rounded-card bg-danger/12 px-5 py-6">
      <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</p>
      <p role="alert" className="text-[13.5px] text-ink-soft text-pretty">
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
