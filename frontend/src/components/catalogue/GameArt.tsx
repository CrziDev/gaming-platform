import { cn } from '@/lib/cn'

type GameArtProps = {
  seed: number
  name?: string
  className?: string
}

const grain =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function GameArt({ seed, name, className }: GameArtProps) {
  const hue = seed % 360
  const partner = (hue + 52) % 360
  const counter = (hue + 300) % 360
  const glowX = 22 + (seed % 5) * 14
  const glowY = 18 + ((seed >> 2) % 4) * 16

  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden bg-surface-2 @container', className)}
      style={{
        backgroundImage: [
          `radial-gradient(60% 55% at ${glowX}% ${glowY}%, oklch(78% 0.17 ${hue} / 0.55), transparent 70%)`,
          `radial-gradient(70% 60% at ${100 - glowX}% ${100 - glowY}%, oklch(45% 0.18 ${counter} / 0.55), transparent 70%)`,
          `linear-gradient(160deg, oklch(56% 0.19 ${hue}), oklch(28% 0.12 ${partner}))`,
        ].join(', '),
      }}
    >
      <div
        className="absolute inset-0 opacity-15 mix-blend-overlay"
        style={{ backgroundImage: grain }}
      />
      {name ? (
        <span className="absolute -right-[8%] -bottom-[12%] font-display text-[68cqmin] leading-none font-bold text-white/10 select-none">
          {name.charAt(0)}
        </span>
      ) : null}
    </div>
  )
}
