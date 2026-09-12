import { cn } from '@/lib/cn'

type GameArtProps = {
  src?: string | null
  caption?: string
  className?: string
}

export function GameArt({ src, caption = 'game art', className }: GameArtProps) {
  return (
    <div
      aria-hidden
      className={cn('relative flex items-center justify-center overflow-hidden bg-surface-3', className)}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <span className="label-mono text-[9.5px] text-ink-mute">{caption}</span>
      )}
    </div>
  )
}
