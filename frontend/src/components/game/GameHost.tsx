import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type Ref } from 'react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

import { GameLoader } from './GameLoader'

export type GameFrameStatus = 'loading' | 'ready' | 'error'

export type GameFrame = {
  url: string
  key: number
  status: GameFrameStatus
  error?: string | undefined
  onRetry: () => void
}

export type GameStageRect = { x: number; y: number; width: number; height: number }

// The stage rect plus the rects the platform's own controls cover, so the frame can keep
// its art clear of them.
export type GameLayout = GameStageRect & { controls: GameStageRect[] }

type GameHostProps = {
  name: string
  subtitle?: string | undefined
  frame?: GameFrame | undefined
  // Receives the iframe element once it mounts, so the caller can bind to it.
  frameRef?: Ref<HTMLIFrameElement | null> | undefined
  // Width over height of the board inside the stage.
  stageAspect?: number | undefined
  // Pixels the stage keeps clear between the board and each side of the screen, for
  // art the frame draws beside it.
  stageGutter?: number | undefined
  // Pixels the title row stands over the stage's empty top corners.
  titleOverlap?: number | undefined
  // Where the stage and the controls sit over the frame, so the game can draw its board
  // there and its art around them.
  onStage?: ((layout: GameLayout) => void) | undefined
  // The game whose skin dresses the controls; the platform's own look otherwise.
  skin?: string | undefined
  // The game's own lettering for its name, in place of the platform's title and subtitle.
  titleMark?: ReactNode
  actions?: ReactNode
  controls?: ReactNode
  className?: string
}

// The one place a game renders: a zone the game's frame fills edge to edge, with the
// platform's title row, the board's stage, and the bet panel laid over it in a single
// centred column. The zone is as tall as that column, up to the height its caller
// allows; below that the stage keeps the board's shape and shrinks so the bet panel
// always fits. On a short, wide screen the column splits: the stage takes the full
// height and the title row and bet panel stand beside it. It knows nothing about the
// bridge.
export function GameHost({
  name,
  subtitle,
  frame,
  frameRef,
  stageAspect = 10 / 10.6,
  stageGutter = 0,
  titleOverlap = 0,
  onStage,
  skin,
  titleMark,
  actions,
  controls,
  className,
}: GameHostProps) {
  const zoneRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const zone = zoneRef.current
    const stage = stageRef.current
    if (!zone || !stage || !onStage) return

    const measure = () => {
      const outer = zone.getBoundingClientRect()
      const within = (element: Element): GameStageRect => {
        const inner = element.getBoundingClientRect()
        return { x: inner.left - outer.left, y: inner.top - outer.top, width: inner.width, height: inner.height }
      }
      const board = within(stage)
      if (board.width <= 0 || board.height <= 0) return
      const controls = [headerRef.current, controlsRef.current]
        .filter((element) => element !== null)
        .map(within)
        .filter((rect) => rect.width > 0 && rect.height > 0)
      onStage({ ...board, controls })
    }
    measure()

    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    for (const element of [zone, headerRef.current, stage, controlsRef.current]) {
      if (element) observer?.observe(element)
    }
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [onStage])

  const clearOfGutters = `calc(100vw - ${2 * stageGutter}px)`

  return (
    <section
      ref={zoneRef}
      aria-label={`${name} game`}
      data-game-skin={skin}
      className={cn('@container/game relative isolate flex min-h-0 flex-col overflow-hidden bg-base', className)}
    >
      {frame ? (
        <iframe
          key={frame.key}
          ref={frameRef}
          title={`${name} game`}
          src={frame.url}
          referrerPolicy="same-origin"
          tabIndex={-1}
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 block size-full border-0 transition-opacity duration-standard ease-standard',
            frame.status === 'loading' && 'opacity-0',
          )}
        />
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[600px] flex-col px-4.5 pt-3 pb-3.5 [container-type:inline-size] sm:pt-4 sm:pb-4 game-side:grid game-side:max-w-[1000px] game-side:grid-cols-[auto_340px] game-side:grid-rows-[auto_1fr] game-side:justify-center game-side:gap-x-6 game-side:gap-y-4">
        <header
          ref={headerRef}
          className="relative z-1 flex items-start justify-between gap-3 game-side:col-start-2 game-side:row-start-1 game-side:flex-col game-side:justify-start"
        >
          {titleMark ?? (
            <div className="min-w-0">
              <h1 className="text-[24px] leading-none font-bold tracking-[-0.03em] text-white [text-shadow:0_2px_18px_rgb(0_0_0/0.5)] sm:text-[28px] game-side:text-[24px]">
                {name}
              </h1>
              {subtitle ? (
                <p className="mt-1.5 font-mono text-[10px] leading-none tracking-[0.24em] whitespace-nowrap text-ink-cool [text-shadow:0_1px_2px_rgb(0_0_0/0.9),0_0_10px_rgb(0_0_0/0.85)] min-[480px]:tracking-[0.32em] sm:mt-2.5">
                  {subtitle}
                </p>
              ) : null}
            </div>
          )}
          {actions ? (
            <div data-part="title-actions" className="flex shrink-0 gap-2">
              {actions}
            </div>
          ) : null}
        </header>

        {/* As tall as the board at full width, less its gutters; shrinks when the zone runs out of height.
            It may tuck under the title row by the title's overlap. Beside the controls it is as tall as
            the screen allows, up to the board at full width. */}
        <div
          style={
            {
              flexBasis: `calc(min(100cqw + 2.25rem, ${clearOfGutters}) / ${stageAspect})`,
              '--stage-aspect': stageAspect,
              '--stage-top': titleOverlap > 0 ? `${-titleOverlap}px` : '0.375rem',
            } as CSSProperties
          }
          className="-mx-4.5 mt-(--stage-top) min-h-0 [container-type:size] game-side:col-start-1 game-side:row-span-2 game-side:row-start-1 game-side:mx-0 game-side:mt-0 game-side:h-(--stage-side-height) game-side:w-[min(calc(var(--stage-side-height)_*_var(--stage-aspect)),calc(100cqw_-_340px_-_1.5rem))] game-side:[--stage-side-height:min(calc(100dvh_-_5.75rem),calc(600px_/_var(--stage-aspect)))]"
        >
          <div
            ref={stageRef}
            style={{
              aspectRatio: stageAspect,
              width: `min(100cqw, calc(100cqh * ${stageAspect}), ${clearOfGutters})`,
            }}
            className="relative mx-auto max-h-full"
          >
            {!frame ? (
              <div className="absolute inset-4 flex items-center justify-center rounded-card bg-surface-3">
                <span className="label-mono text-ink-cool">{name}</span>
              </div>
            ) : null}

            {frame?.status === 'loading' ? <GameLoader name={name} /> : null}

            {frame?.status === 'error' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">The game didn&rsquo;t load</p>
                <p role="alert" className="max-w-[42ch] text-[13.5px] text-ink-mute text-pretty">
                  {frame.error ?? 'It took too long to respond.'}
                </p>
                <Button variant="secondary" size="sm" onClick={frame.onRetry}>
                  Try again
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {controls ? (
          <div
            ref={controlsRef}
            className="relative mt-1 shrink-0 game-side:col-start-2 game-side:row-start-2 game-side:mt-0 game-side:self-end"
          >
            {controls}
          </div>
        ) : null}
      </div>
    </section>
  )
}
