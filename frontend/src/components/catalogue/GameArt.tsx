import { cn } from '@/lib/cn'

type GameArtProps = {
  seed: number
  name?: string
  className?: string
}

export function GameArt({ seed, name, className }: GameArtProps) {
  const hue = seed % 360
  const partner = (hue + 52) % 360

  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden bg-surface-2', className)}
      style={{
        backgroundImage: `linear-gradient(152deg, oklch(56% 0.19 ${hue}), oklch(30% 0.12 ${partner}))`,
      }}
    >
      <div
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.10) 0 10px, transparent 10px 20px)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle at 30% 22%, rgb(255 255 255 / 0.28), transparent 62%)',
        }}
      />
      {name ? (
        <span className="absolute inset-x-0 bottom-0 p-3 font-display text-sm font-bold text-white/90 drop-shadow">
          {name}
        </span>
      ) : null}
    </div>
  )
}
