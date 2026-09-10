import type { ReactNode } from 'react'

import { Button } from '@/components/ui/Button'
import { useSession } from '@/features/auth'

export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession()

  if (session.isPending) {
    return <AppLoading />
  }

  if (session.isError) {
    return <AppUnavailable onRetry={() => void session.refetch()} />
  }

  return <>{children}</>
}

function AppLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <p role="status" aria-live="polite" className="text-ink-mute">
        Loading…
      </p>
    </div>
  )
}

function AppUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p role="alert" className="text-ink">
        Cannot reach the server right now.
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
