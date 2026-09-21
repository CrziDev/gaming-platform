import { ChevronLeft, Heart, Maximize2, Minimize2, SlidersHorizontal } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Link, useParams } from 'react-router'

import { GameHost } from '@/components/game/GameHost'
import { SoundToggle } from '@/components/game/SoundToggle'
import { Button, IconButton, buttonStyles } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useFavorites, useGame, useSetFavorite } from '@/features/catalogue'
import { GameHistory, gameModuleFor, useGameSession, type GameSession } from '@/features/gameplay'
import { useWallet } from '@/features/wallet'
import { cn } from '@/lib/cn'
import { MOBILE_GAME_QUERY, useMediaQuery } from '@/lib/media'
import { formatMoney, money, type Money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function GamePage() {
  const { slug = '' } = useParams()
  const gameQuery = useGame(slug)
  const game = gameQuery.data
  // A title is denominated in one currency, so the balance beside the bet
  // controls is that wallet's — never whichever one the header happens to show.
  const { data: wallet } = useWallet(game?.currency ?? 'PHP')
  const favorites = useFavorites(true)
  const setFavorite = useSetFavorite()
  const hostRef = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [shortfall, setShortfall] = useState(false)
  const [stake, setStake] = useState<{ slug: string; amountMinor: number } | null>(null)
  const mobileGame = useMediaQuery(MOBILE_GAME_QUERY)

  const module = gameModuleFor(slug)
  const onShortfall = useCallback(() => setShortfall(true), [])
  const session = useGameSession({ module, slug, currency: game?.currency ?? 'PHP', onShortfall })

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      await hostRef.current?.requestFullscreen()
    } catch {
      setFullscreen(document.fullscreenElement !== null)
    }
  }

  if (gameQuery.isPending) {
    const state = <Skeleton className="h-96 rounded-card" />
    return mobileGame ? <MobileGameState title="Game">{state}</MobileGameState> : state
  }

  if (gameQuery.isError) {
    const state = <ErrorState message={gameQuery.error.message} onRetry={() => void gameQuery.refetch()} />
    return mobileGame ? <MobileGameState title="Game unavailable">{state}</MobileGameState> : state
  }

  if (!game) {
    const state = (
      <EmptyState
        title="Game unavailable"
        description="This game isn't available right now."
        action={
          <Link to={paths.games} className="text-accent-ink hover:text-accent-hi">
            Back to games
          </Link>
        }
      />
    )
    return mobileGame ? <MobileGameState title="Game unavailable">{state}</MobileGameState> : state
  }

  const favorite = favorites.data?.some((entry) => entry.id === game.id) ?? false
  const stakeMinor = stake?.slug === game.slug ? stake.amountMinor : game.min_wager_minor
  const setStakeMinor: Dispatch<SetStateAction<number>> = (next) => {
    setStake((current) => {
      const amount = current?.slug === game.slug ? current.amountMinor : game.min_wager_minor
      return {
        slug: game.slug,
        amountMinor: typeof next === 'function' ? next(amount) : next,
      }
    })
  }
  const paramsSlot = module ? (
    <module.Controls
      params={session.params}
      onChange={session.setParams}
      disabled={!session.canChangeParams}
    />
  ) : null
  const paramsSummary = module ? module.summarizeParams(session.params) : 'Game settings'
  const gameHost = (
    <GameHost
      ref={hostRef}
      name={game.name}
      fullscreen={fullscreen}
      fitAvailable={mobileGame}
      frame={
        module
          ? {
              url: module.frameUrl,
              key: session.frame.key,
              status: session.frame.status,
              error: session.frame.error,
              onRetry: session.frame.retry,
              aspect: module.aspect,
            }
          : undefined
      }
      frameRef={module ? session.attachFrame : undefined}
      chrome={module ? <SoundToggle on={session.sound} onChange={session.setSound} /> : null}
    />
  )

  if (mobileGame) {
    return (
      <div className="min-h-full w-full pb-[calc(9rem+env(safe-area-inset-bottom))] sm:pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="flex h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] flex-col sm:h-[calc(100dvh-5rem-env(safe-area-inset-bottom))]">
          <nav
            aria-label="Game toolbar"
            className="flex min-h-14 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top)]"
          >
            <MobileGameBack />
            <h1 className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold tracking-[-0.01em] text-ink">
              {game.name}
            </h1>
            <IconButton
              label={favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={favorite}
              disabled={setFavorite.isPending}
              onClick={() => setFavorite.mutate({ slug: game.slug, favorite: !favorite })}
              className={cn(favorite && 'text-accent-ink')}
            >
              <Heart aria-hidden size={17} strokeWidth={1.6} fill={favorite ? 'currentColor' : 'none'} />
            </IconButton>
            <IconButton label={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={() => void toggleFullscreen()}>
              {fullscreen ? (
                <Minimize2 aria-hidden size={17} strokeWidth={1.5} />
              ) : (
                <Maximize2 aria-hidden size={17} strokeWidth={1.5} />
              )}
            </IconButton>
          </nav>

          <div className="min-h-0 flex-1 px-3.5 py-2">{gameHost}</div>
        </div>

        <BetControls
          mobile
          stakeMinor={stakeMinor}
          setStakeMinor={setStakeMinor}
          balance={wallet ? money(wallet.balance_minor, wallet.currency) : null}
          minMinor={game.min_wager_minor}
          maxMinor={game.max_wager_minor}
          stepMinor={game.wager_step_minor}
          session={module ? session : null}
          paramsSlot={paramsSlot}
          paramsSummary={paramsSummary}
          shortfall={shortfall}
          onShortfall={setShortfall}
        />

        <div className="px-3.5">
          <GameHistory gameId={game.id} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
      <nav aria-label="Breadcrumb" className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-mute">
          <Link to={paths.games} className="inline-flex min-h-11 items-center gap-1 hover:text-ink-soft">
            <ChevronLeft aria-hidden size={15} strokeWidth={1.5} />
            Games
          </Link>
          <span aria-hidden>/</span>
          <span className="truncate">{game.category_name}</span>
          <span aria-hidden>/</span>
          <span className="truncate text-ink">{game.name}</span>
        </div>

        <div className="flex items-center gap-1">
          <IconButton
            label={favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={favorite}
            disabled={setFavorite.isPending}
            onClick={() => setFavorite.mutate({ slug: game.slug, favorite: !favorite })}
            className={cn(favorite && 'text-accent-ink')}
          >
            <Heart aria-hidden size={16} strokeWidth={1.6} fill={favorite ? 'currentColor' : 'none'} />
          </IconButton>
          <Button variant="ghost" size="sm" onClick={() => void toggleFullscreen()}>
            {fullscreen ? (
              <Minimize2 aria-hidden size={15} strokeWidth={1.5} />
            ) : (
              <Maximize2 aria-hidden size={15} strokeWidth={1.5} />
            )}
            <span className="hidden sm:inline">{fullscreen ? 'Exit full screen' : 'Full screen'}</span>
          </Button>
        </div>
      </nav>

      <div className="grid gap-4 sm:grid-cols-[280px_minmax(0,1fr)] sm:items-start">
        <div className="order-2 flex flex-col gap-4 sm:order-1">
          <BetControls
            mobile={false}
            stakeMinor={stakeMinor}
            setStakeMinor={setStakeMinor}
            balance={wallet ? money(wallet.balance_minor, wallet.currency) : null}
            minMinor={game.min_wager_minor}
            maxMinor={game.max_wager_minor}
            stepMinor={game.wager_step_minor}
            session={module ? session : null}
            paramsSlot={paramsSlot}
            paramsSummary={paramsSummary}
            shortfall={shortfall}
            onShortfall={setShortfall}
          />
        </div>

        <div className="order-1 mx-auto w-full max-w-[520px] min-w-0 sm:order-2 sm:max-w-none">
          {gameHost}
        </div>
      </div>

      <GameHistory gameId={game.id} />
    </div>
  )
}

function MobileGameBack() {
  return (
    <Link
      to={paths.games}
      aria-label="Back to games"
      title="Back to games"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-input text-ink-mute transition-colors duration-fast ease-standard hover:bg-wash hover:text-ink-soft"
    >
      <ChevronLeft aria-hidden size={18} strokeWidth={1.6} />
    </Link>
  )
}

function MobileGameState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <nav
        aria-label="Game toolbar"
        className="flex min-h-14 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top)]"
      >
        <MobileGameBack />
        <h1 className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
      </nav>
      <div className="min-h-0 flex-1 p-3.5">{children}</div>
    </div>
  )
}

type BetControlsProps = {
  mobile: boolean
  stakeMinor: number
  setStakeMinor: Dispatch<SetStateAction<number>>
  balance: Money | null
  minMinor: number
  maxMinor: number
  stepMinor: number
  // Present only for a title with an engine; every other game keeps the display slot.
  session: GameSession | null
  paramsSlot: ReactNode
  paramsSummary: string
  shortfall: boolean
  onShortfall: (open: boolean) => void
}

function BetControls({
  mobile,
  stakeMinor,
  setStakeMinor,
  balance,
  minMinor,
  maxMinor,
  stepMinor,
  session,
  paramsSlot,
  paramsSummary,
  shortfall,
  onShortfall,
}: BetControlsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const toast = useToast()
  const currency = balance?.currency ?? 'PHP'
  const busy = session?.playing ?? false
  // A title with an engine offers a bet only once its board is configured from the
  // server's manifest; the host overlay says why while it is not.
  const offered = session ? session.canPlay : true

  // The server accepts only min + n × step, so the selector can only produce that.
  // A stake is player input rather than a financial outcome, but an input the server
  // will refuse is still a broken control.
  const clamp = (value: number) => {
    const bounded = Math.min(Math.max(value, minMinor), maxMinor)
    const steps = Math.round((bounded - minMinor) / stepMinor)
    return minMinor + steps * stepMinor
  }

  const covered = () => {
    if (!balance || stakeMinor > balance.amount_minor) {
      onShortfall(true)
      return false
    }
    return true
  }

  const place = () => {
    if (!covered()) return
    if (!session) {
      toast.push("This game isn't available to play yet.")
      return
    }
    void session.play(stakeMinor)
  }

  const shortfallDialog = (
    <Modal
      open={shortfall}
      onClose={() => onShortfall(false)}
      title="Not enough balance"
      description="This stake is more than your wallet holds. Deposit to keep playing."
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={() => onShortfall(false)}>
            Change stake
          </Button>
          <Link
            to={paths.deposit}
            onClick={() => onShortfall(false)}
            className={buttonStyles('primary', 'md')}
          >
            Deposit
          </Link>
        </div>
      }
    >
      <dl className="flex flex-col gap-2 text-[13.5px]">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-mute">Stake</dt>
          <dd className="font-mono font-medium tnum">{formatMoney(money(stakeMinor, currency))}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-mute">Balance</dt>
          <dd className="font-mono font-medium tnum">{balance ? formatMoney(balance) : '—'}</dd>
        </div>
      </dl>
    </Modal>
  )

  if (mobile) {
    return (
      <>
        <section
          aria-label="Bet controls"
          className="overlay-shadow fixed bottom-0 z-40 border-t border-white/5 bg-panel p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:grid sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center sm:gap-2 [left:env(safe-area-inset-left)] [right:env(safe-area-inset-right)]"
        >
          <div className="mb-2 flex min-h-11 items-center justify-between gap-2 sm:mb-0">
            <Link
              to={paths.deposit}
              className="flex min-h-11 min-w-0 flex-col justify-center rounded-input px-2 text-left hover:bg-wash"
            >
              <span className="label-mono text-ink-mute">Balance</span>
              <span className="truncate font-mono text-[12.5px] font-medium text-ink-soft tnum">
                {balance ? formatMoney(balance) : '—'}
              </span>
            </Link>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(true)}
              className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-input px-2.5 text-[12px] font-medium text-ink-mute transition-colors duration-fast ease-standard hover:bg-wash hover:text-ink-soft"
            >
              <SlidersHorizontal aria-hidden size={15} strokeWidth={1.6} className="shrink-0" />
              <span className="truncate">{paramsSummary}</span>
            </button>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(116px,0.85fr)] gap-2">
            <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center rounded-input bg-inset p-0.5">
              <button
                type="button"
                aria-label="Decrease bet"
                onClick={() => setStakeMinor((value) => clamp(value - stepMinor))}
                className="inline-flex min-h-12 items-center justify-center rounded-[7px] text-[16px] text-ink-mute hover:bg-wash hover:text-ink-soft"
              >
                −
              </button>
              <div className="min-w-0 truncate text-center font-mono text-[14px] font-medium text-ink tnum">
                {formatMoney(money(stakeMinor, currency))}
              </div>
              <button
                type="button"
                aria-label="Increase bet"
                onClick={() => setStakeMinor((value) => clamp(value + stepMinor))}
                className="inline-flex min-h-12 items-center justify-center rounded-[7px] text-[16px] text-ink-mute hover:bg-wash hover:text-ink-soft"
              >
                +
              </button>
            </div>

            <Button variant="play" size="lg" fullWidth onClick={place} disabled={busy || !offered}>
              PLACE BET
            </Button>
          </div>
        </section>

        <Modal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="Bet settings"
          description="Adjust the next stake and game setup."
          placement="bottom"
          footer={
            <Button fullWidth onClick={() => setSettingsOpen(false)}>
              Done
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="label-mono text-ink-mute">Bet amount</span>
                <span className="font-mono text-[15px] font-medium text-ink tnum">
                  {formatMoney(money(stakeMinor, currency))}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setStakeMinor((value) => clamp(Math.floor(value / 2)))}
                >
                  ½
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setStakeMinor((value) => clamp(value * 2))}>
                  2×
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => balance && setStakeMinor(clamp(balance.amount_minor))}
                >
                  Max
                </Button>
              </div>
            </div>

            {paramsSlot ? <div className="border-t border-white/5 pt-4">{paramsSlot}</div> : null}
          </div>
        </Modal>

        {shortfallDialog}
      </>
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-card bg-surface-1 p-3.5">
      <div className="flex flex-col gap-2">
        <span className="label-mono text-ink-mute">Bet amount</span>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Decrease bet"
            onClick={() => setStakeMinor((value) => clamp(value - stepMinor))}
            className="size-11 px-0"
          >
            −
          </Button>
          <div className="flex min-h-11 flex-1 items-center justify-center rounded-input bg-inset font-mono text-[17px] font-medium text-ink tnum">
            {formatMoney(money(stakeMinor, currency))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Increase bet"
            onClick={() => setStakeMinor((value) => clamp(value + stepMinor))}
            className="size-11 px-0"
          >
            +
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" onClick={() => setStakeMinor((v) => clamp(Math.floor(v / 2)))}>
            ½
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setStakeMinor((v) => clamp(v * 2))}>
            2×
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => balance && setStakeMinor(clamp(balance.amount_minor))}
          >
            Max
          </Button>
        </div>
      </div>

      {paramsSlot}

      <Button variant="play" size="lg" fullWidth onClick={place} disabled={busy || !offered}>
        PLACE BET
      </Button>

      {shortfallDialog}
    </section>
  )
}
