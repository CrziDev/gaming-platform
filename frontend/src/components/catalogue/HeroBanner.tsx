import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router'

import type { Game } from '@/api/types'
import { buttonStyles } from '@/components/ui/Button'
import { useAuthIntent, useSession } from '@/features/auth'
import { useActiveCurrency } from '@/features/wallet'
import { cn } from '@/lib/cn'
import { bannerArtUrl, phoneBannerArtUrl } from '@/lib/gameArt'
import { useMediaQuery } from '@/lib/media'
import { formatMoney, money } from '@/lib/money'
import { paths } from '@/routes/paths'

export const BANNER_ROTATION_MS = 3000

export function HeroBanner({ featured }: { featured: Game[] }) {
  const [chosen, setChosen] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [touches, setTouches] = useState(0)
  const hidden = usePageHidden()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const sectionRef = useRef<HTMLElement>(null)

  const count = featured.length
  const active = count > 0 ? chosen % count : 0
  const rotates = count > 1 && !reducedMotion
  const holding = hovered || focused || hidden

  useEffect(() => {
    if (!rotates || holding) return
    const timer = window.setTimeout(() => setChosen((current) => (current + 1) % count), BANNER_ROTATION_MS)
    return () => window.clearTimeout(timer)
  }, [rotates, holding, active, count, touches])

  if (count === 0) {
    return null
  }

  const onPointerEnter = (event: PointerEvent) => event.pointerType === 'mouse' && setHovered(true)
  const onPointerLeave = (event: PointerEvent) => event.pointerType === 'mouse' && setHovered(false)
  const onPointerDown = (event: PointerEvent) => event.pointerType !== 'mouse' && setTouches((n) => n + 1)
  const onBlur = (event: FocusEvent) => {
    if (!sectionRef.current?.contains(event.relatedTarget as Node | null)) setFocused(false)
  }

  return (
    <section
      ref={sectionRef}
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      aria-label={count > 1 ? 'Featured games' : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      className="relative grid overflow-hidden rounded-card bg-banner"
    >
      {featured.map((game, index) => (
        <BannerSlide
          key={game.id}
          game={game}
          active={index === active}
          label={count > 1 ? `${index + 1} of ${count}` : undefined}
          controls={
            count > 1 ? (
              <div className="flex items-center">
                {featured.map((choice, position) => (
                  <button
                    key={choice.id}
                    type="button"
                    aria-label={`Show ${choice.name}`}
                    aria-current={position === active}
                    onClick={() => setChosen(position)}
                    className="tap-target group flex h-6 w-5 items-center justify-center"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'h-[3px] w-3.5 rounded-[2px] transition-colors duration-standard ease-standard',
                        position === active ? 'bg-ink' : 'bg-ink-mute group-hover:bg-ink-soft',
                      )}
                    />
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      ))}

      <span aria-hidden className="edge-lit pointer-events-none absolute inset-0 rounded-card" />
    </section>
  )
}

function BannerSlide({
  game,
  active,
  label,
  controls,
}: {
  game: Game
  active: boolean
  label: string | undefined
  controls: ReactNode
}) {
  const { data: user } = useSession()
  const { open } = useAuthIntent()
  const currency = useActiveCurrency()

  const destination = paths.game(game.slug)
  const minBet = formatMoney(money(game.wager_limits[currency].min_wager_minor, currency))

  const art = bannerArtUrl(game)
  const phoneArt = phoneBannerArtUrl(game) ?? art
  const phoneButton = '@max-[640px]:px-3 @max-[640px]:text-[12.5px]'

  return (
    <div
      role={label ? 'group' : undefined}
      aria-roledescription={label ? 'slide' : undefined}
      aria-label={label}
      aria-hidden={!active}
      inert={!active}
      className={cn(
        'relative [grid-area:1/1] transition-[opacity,visibility] duration-standard ease-standard',
        active ? 'visible opacity-100' : 'invisible opacity-0',
      )}
    >
      {art ? (
        <>
          <div
            aria-hidden
            style={
              {
                '--banner-art': `url(${JSON.stringify(art)})`,
                '--banner-art-phone': `url(${JSON.stringify(phoneArt)})`,
              } as CSSProperties
            }
            className="absolute inset-0 bg-(image:--banner-art-phone) bg-cover bg-no-repeat bg-position-[right_-17px_top_0] @min-[640px]:bg-(image:--banner-art) @min-[640px]:bg-position-[right_-290px_bottom_0] @min-[960px]:bg-right-bottom"
          />
          <div aria-hidden className="banner-scrim absolute inset-y-0 left-0 w-3/5" />
        </>
      ) : null}

      <div className="relative flex h-full min-h-[200px] flex-col items-start justify-center gap-1.5 px-4 py-3.5 @min-[640px]:min-h-[236px] @min-[640px]:max-w-[52%] @min-[640px]:gap-2.5 @min-[640px]:px-6 @min-[640px]:py-[22px]">
        <div className="flex max-w-[56%] items-center gap-3 @min-[640px]:max-w-none">
          <span className="label-mono inline-flex items-center gap-1.5 text-accent-ink">
            <span aria-hidden className="size-[5px] rounded-full bg-accent-ink" />
            Featured
          </span>
          {controls}
        </div>

        <h1 className="max-w-[56%] text-[20px] leading-[1.1] font-bold tracking-[-0.02em] text-ink text-balance @min-[640px]:max-w-none @min-[640px]:text-[24px]">
          {game.name}
        </h1>

        {game.description ? (
          <p className="hidden max-w-[44ch] text-[13.5px] leading-normal text-ink-mute text-pretty @min-[640px]:block">
            {game.description}
          </p>
        ) : null}

        <p className="flex max-w-[56%] flex-wrap items-center gap-x-2 font-mono text-[11px] text-ink-mute @min-[640px]:max-w-none">
          <span>{game.provider}</span>
          <span aria-hidden>·</span>
          <span>
            Min bet <span className="text-ink-soft tnum">{minBet}</span>
          </span>
          <span aria-hidden>·</span>
          <span>{game.category_name}</span>
        </p>

        <div className="flex gap-2 pt-1 @min-[640px]:flex-wrap @min-[640px]:pt-0.5">
          {user ? (
            <Link to={destination} className={cn(buttonStyles('primary', 'lg'), phoneButton)}>
              Play {game.name}
            </Link>
          ) : (
            <button
              type="button"
              className={cn(buttonStyles('primary', 'lg'), phoneButton)}
              onClick={() => open({ tab: 'join', redirectTo: destination, context: game.name })}
            >
              Join now
            </button>
          )}
          <Link
            to={paths.games}
            className={cn(
              'tap-target glass-float inline-flex min-h-10 items-center justify-center rounded-input px-4 text-[13.5px] font-medium whitespace-nowrap text-ink-control transition-colors duration-fast ease-standard hover:bg-float-hover active:translate-y-px motion-reduce:transform-none lg:min-h-[38px] lg:px-5',
              phoneButton,
            )}
          >
            Browse all games
          </Link>
        </div>
      </div>
    </div>
  )
}

function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden')

  useEffect(() => {
    const sync = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  return hidden
}
