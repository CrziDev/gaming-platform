import { cn } from '@/lib/cn'

type GameArtProps = {
  caption?: string
  className?: string
}

export function GameArt({ caption = 'game art', className }: GameArtProps) {
  return (
    <div
      aria-hidden
      className={cn('relative flex items-center justify-center overflow-hidden bg-surface-3', className)}
    >
      <span className="label-mono text-[9.5px] text-ink-mute">{caption}</span>
    </div>
  )
}
