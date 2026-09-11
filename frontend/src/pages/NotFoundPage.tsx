import { Link } from 'react-router'

import { buttonStyles } from '@/components/ui/Button'
import { paths } from '@/routes/paths'

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
      <span className="label-mono text-ink-mute">404</span>
      <h1 className="text-2xl font-semibold text-ink">Page not found</h1>
      <p className="max-w-[42ch] text-sm text-ink-mute">
        That route is not part of the platform. The lobby has everything that is.
      </p>
      <Link to={paths.lobby} className={buttonStyles('secondary', 'md')}>
        Go to the lobby
      </Link>
    </main>
  )
}
