import { ChevronLeft, Heart, Maximize2, Minimize2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'

import { GameHost } from '@/components/game/GameHost'
import { SoundToggle } from '@/components/game/SoundToggle'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useFavorites, useGame, useSetFavorite } from '@/features/catalogue'
import { GameHistory, GameNotice, gameModuleFor, useGameSession, type GameSession } from '@/features/gameplay'
import { useWallet } from '@/features/wallet'
import { cn } from '@/lib/cn'
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
    return <Skeleton className="h-96 rounded-card" />
  }

  if (gameQuery.isError) {
    return <ErrorState message={gameQuery.error.message} onRetry={() => void gameQuery.refetch()} />
  }

  if (!game) {
    return (
      <EmptyState
        title="Game unavailable"
        description="This game is not in the catalogue right now."
        action={
          <Link to={paths.games} className="text-accent-ink hover:text-accent-hi">
            Back to games
          </Link>
        }
      />
    )
  }

  const favorite = favorites.data?.some((entry) => entry.id === game.id) ?? false

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

      <div className="grid gap-4 @rail:grid-cols-[280px_minmax(0,1fr)] @rail:items-start">
        <div className="order-2 flex flex-col gap-4 @rail:order-1">
          <BetControls
            balance={wallet ? money(wallet.balance_minor, wallet.currency) : null}
            minMinor={game.min_wager_minor}
            maxMinor={game.max_wager_minor}
            stepMinor={game.wager_step_minor}
            session={module ? session : null}
            paramsSlot={
              module ? (
                <module.Controls
                  params={session.params}
                  onChange={session.setParams}
                  disabled={!session.canChangeParams}
                />
              ) : null
            }
            shortfall={shortfall}
            onShortfall={setShortfall}
          />
          {module ? <GameNotice /> : null}
        </div>

        <div className="order-1 mx-auto w-full max-w-[520px] min-w-0 @rail:order-2 @rail:max-w-none">
          <GameHost
            ref={hostRef}
            name={game.name}
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
        </div>
      </div>

      <GameHistory gameId={game.id} />
    </div>
  )
}

type BetControlsProps = {
  balance: Money | null
  minMinor: number
  maxMinor: number
  stepMinor: number
  // Present only for a title with an engine; every other game keeps the display slot.
  session: GameSession | null
  paramsSlot: ReactNode
  shortfall: boolean
  onShortfall: (open: boolean) => void
}

function BetControls({
  balance,
  minMinor,
  maxMinor,
  stepMinor,
  session,
  paramsSlot,
  shortfall,
  onShortfall,
}: BetControlsProps) {
  const [stakeMinor, setStakeMinor] = useState(minMinor)
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
      toast.push(`Stake of ${formatMoney(money(stakeMinor, currency))} sent to the game module.`)
      return
    }
    void session.play(stakeMinor)
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

      {paramsSlot ?? (
        <div className="rounded-input bg-inset p-3">
          <p className="font-mono text-[10.5px] leading-relaxed text-ink-mute">
            Game parameter slot — rows, risk or lines come from the game manifest. Games that ship their
            own controls leave this panel empty.
          </p>
        </div>
      )}

      <Button variant="play" size="lg" fullWidth onClick={place} disabled={busy || !offered}>
        PLACE BET
      </Button>

      <Modal
        open={shortfall}
        onClose={() => onShortfall(false)}
        title="Not enough balance"
        description={`This stake is more than your wallet holds. Deposit to keep playing.`}
        footer={
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={() => onShortfall(false)}>
              Change stake
            </Button>
            <Link to={paths.deposit} className="contents">
              <Button onClick={() => onShortfall(false)}>Deposit</Button>
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
            <dd className="font-mono font-medium tnum">
              {balance ? formatMoney(balance) : '—'}
            </dd>
          </div>
        </dl>
      </Modal>
    </section>
  )
}
