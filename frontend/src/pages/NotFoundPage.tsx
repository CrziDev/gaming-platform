import { Link } from 'react-router'

import { buttonStyles } from '@/components/ui/Button'
import { paths } from '@/routes/paths'

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center">
      <span className="label-mono text-ink-mute">404</span>
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">Page not found</h1>
      <Link to={paths.lobby} className={buttonStyles('secondary', 'md')}>
        Go to the lobby
      </Link>
    </main>
  )
}
