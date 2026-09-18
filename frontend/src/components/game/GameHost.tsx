import { ShieldCheck } from 'lucide-react'
import type { ReactNode, Ref, RefObject } from 'react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

export type GameFrameStatus = 'loading' | 'ready' | 'error'

export type GameFrame = {
  url: string
  key: number
  status: GameFrameStatus
  error?: string | undefined
  onRetry: () => void
  aspect: 'portrait' | 'landscape'
}

type GameHostProps = {
  name: string
  className?: string
  ref?: RefObject<HTMLElement | null>
  frame?: GameFrame | undefined
  // Receives the iframe element once it mounts, so the caller can bind to it.
  frameRef?: Ref<HTMLIFrameElement | null> | undefined
  chrome?: ReactNode
}

// The one place a game renders. Without a frame it is the aspect-locked slot a
// title without an engine still shows; with one it embeds the game page and
// keeps the platform's chrome on top of it. It knows nothing about the bridge.
export function GameHost({ name, className, ref, frame, frameRef, chrome }: GameHostProps) {
  // A portrait board keeps its ratio on a phone; beside a bet panel it takes a
  // fixed height instead, and the game fits its board inside whatever it gets.
  const aspect =
    frame?.aspect === 'portrait'
      ? 'aspect-4/5 @rail:aspect-auto @rail:h-[600px]'
      : 'aspect-4/3 wide:aspect-16/10'

  return (
    <section
      ref={ref}
      aria-label={`${name} game canvas`}
      className={cn(
        'relative overflow-hidden rounded-card bg-surface-3',
        aspect,
        '[&:fullscreen]:aspect-auto [&:fullscreen]:size-full [&:fullscreen]:rounded-none',
        className,
      )}
    >
      {frame ? (
        <iframe
          key={frame.key}
          ref={frameRef}
          title={`${name} game`}
          src={frame.url}
          referrerPolicy="same-origin"
          className="block size-full border-0"
        />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-end gap-1.5 p-3">
        <span className="label-mono inline-flex items-center gap-1.5 rounded-chip bg-base/70 px-2.5 py-1.5 text-ink-mute">
          <ShieldCheck aria-hidden size={12} strokeWidth={1.5} />
          Fair game
        </span>
        {chrome ? <div className="pointer-events-auto flex items-center gap-1">{chrome}</div> : null}
      </div>

      {!frame ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <span className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{name}</span>
          <span className="label-mono text-ink-mute">game canvas · aspect-locked slot</span>
        </div>
      ) : null}

      {frame?.status === 'loading' ? (
        <div
          role="status"
          aria-label={`Loading ${name}`}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-1 text-center"
        >
          <span className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{name}</span>
          <span className="label-mono text-ink-mute">loading game</span>
        </div>
      ) : null}

      {frame?.status === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-1 px-6 text-center">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">The game did not load</p>
          <p role="alert" className="max-w-[42ch] text-[13.5px] text-ink-mute text-pretty">
            {frame.error ?? 'The game page did not answer in time.'}
          </p>
          <Button variant="secondary" size="sm" onClick={frame.onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </section>
  )
}
