import { Heart, Minus, Plus, ShieldCheck, Wallet } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import {
  GameHistory,
  gameModuleFor,
  riskLabels,
  stakeLadder,
  stepStake,
  useGameSession,
  type GameSession,
} from '@/features/gameplay'
import { useActiveCurrency, useWallet } from '@/features/wallet'
import { cn } from '@/lib/cn'
import { formatMultiplier } from '@/lib/format'
import { formatMoney, money, type Currency, type Money } from '@/lib/money'
import { paths } from '@/routes/paths'

export function GamePage() {
  const { slug = '' } = useParams()
  const gameQuery = useGame(slug)
  const game = gameQuery.data
  const currency = useActiveCurrency()
  const { data: wallet } = useWallet(currency)
  const favorites = useFavorites(true)
  const setFavorite = useSetFavorite()
  const [shortfall, setShortfall] = useState(false)
  const [fairGame, setFairGame] = useState(false)
  const [stake, setStake] = useState<{ slug: string; currency: Currency; amountMinor: number } | null>(null)

  const module = gameModuleFor(slug)
  const onShortfall = useCallback(() => setShortfall(true), [])
  const session = useGameSession({ module, slug, currency, onShortfall })

  if (gameQuery.isPending) {
    return (
      <div className="p-4.5">
        <Skeleton className="h-96 rounded-card" />
      </div>
    )
  }

  if (gameQuery.isError) {
    return (
      <div className="p-4.5">
        <ErrorState message={gameQuery.error.message} onRetry={() => void gameQuery.refetch()} />
      </div>
    )
  }

  if (!game) {
    return (
      <div className="p-4.5">
        <EmptyState
          title="Game unavailable"
          description="This game isn't available right now."
          action={
            <Link to={paths.games} className="text-accent-ink hover:text-accent-hi">
              Back to games
            </Link>
          }
        />
      </div>
    )
  }

  const favorite = favorites.data?.some((entry) => entry.id === game.id) ?? false
  const limits = game.wager_limits[currency]
  const stakeMatches = stake?.slug === game.slug && stake.currency === currency
  const stakeMinor = stakeMatches ? stake.amountMinor : limits.min_wager_minor
  const setStakeMinor: Dispatch<SetStateAction<number>> = (next) => {
    setStake((current) => {
      const amount = current?.slug === game.slug && current.currency === currency ? current.amountMinor : limits.min_wager_minor
      return { slug: game.slug, currency, amountMinor: typeof next === 'function' ? next(amount) : next }
    })
  }

  return (
    <div className="flex flex-col">
      <GameHost
        className="max-h-[max(28rem,calc(100dvh-3.75rem))]"
        name={game.name}
        subtitle={module?.subtitle}
        frame={
          module
            ? {
                url: module.frameUrl,
                key: session.frame.key,
                status: session.frame.status,
                error: session.frame.error,
                onRetry: session.frame.retry,
              }
            : undefined
        }
        frameRef={module ? session.attachFrame : undefined}
        stageAspect={module?.stageAspect}
        stageGutter={module?.stageGutter}
        titleOverlap={module?.titleOverlap}
        onStage={module ? session.setStage : undefined}
        skin={module?.skin ? module.slug : undefined}
        titleMark={module?.TitleMark ? <module.TitleMark name={game.name} subtitle={module.subtitle} /> : undefined}
        actions={
          <>
            <button
              type="button"
              aria-label="Fair game"
              aria-haspopup="dialog"
              disabled={!module}
              onClick={() => setFairGame(true)}
              className="tap-target glass-float flex h-9 items-center justify-center gap-2 rounded-input px-3 text-[13px] font-semibold tracking-[0.08em] text-ink-control transition-colors duration-fast ease-standard hover:bg-float-hover disabled:cursor-default max-[429px]:w-9 max-[429px]:px-0 sm:h-9.5"
            >
              <ShieldCheck aria-hidden size={18} strokeWidth={1.8} />
              <span className="max-[429px]:sr-only">FAIR GAME</span>
            </button>
            {module ? <SoundToggle on={session.sound} onChange={session.setSound} /> : null}
            <IconButton
              label={favorite ? 'Remove from favorites' : 'Add to favorites'}
              size="float"
              data-part="favorite"
              aria-pressed={favorite}
              disabled={setFavorite.isPending}
              onClick={() => setFavorite.mutate({ slug: game.slug, favorite: !favorite })}
              className={cn(favorite && 'text-accent-ink')}
            >
              <Heart aria-hidden size={18} strokeWidth={1.8} fill={favorite ? 'currentColor' : 'none'} />
            </IconButton>
          </>
        }
        controls={
          <>
            <BetPanel
              stakeMinor={stakeMinor}
              setStakeMinor={setStakeMinor}
              balance={wallet ? money(wallet.balance_minor, wallet.currency) : null}
              currency={currency}
              minMinor={limits.min_wager_minor}
              maxMinor={limits.max_wager_minor}
              stepMinor={limits.wager_step_minor}
              session={module ? session : null}
              paramsSlot={
                module ? (
                  <module.Controls
                    params={session.params}
                    onChange={session.setParams}
                    disabled={!session.canChangeParams}
                    board={session.board}
                  />
                ) : null
              }
              shortfall={shortfall}
              onShortfall={setShortfall}
            />
            {module ? <EffectsPreview session={session} stakeMinor={stakeMinor} /> : null}
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1120px] px-3.5 pt-5 pb-8">
        <GameHistory gameId={game.id} currency={currency} />
      </div>

      <FairGameDialog open={fairGame} onClose={() => setFairGame(false)} session={module ? session : null} />
    </div>
  )
}

// Temporary: one button per payout on the chosen risk, each dropping a ball that no
// round settled so the landing effects can be seen without a bet. Remove with
// `previewDrop` in the game session.
function EffectsPreview({ session, stakeMinor }: { session: GameSession; stakeMinor: number }) {
  const payouts = session.board?.[session.params.risk]
  if (!payouts) return null
  const half = payouts.slice(0, Math.ceil(payouts.length / 2))

  return (
    <div
      role="group"
      aria-label="Preview landing effects"
      className="mt-2 flex flex-wrap items-center gap-1.5 rounded-card border border-hairline-soft bg-inset px-2.5 py-2"
    >
      <span className="label-mono mr-1 text-[10px] text-ink-cool">Preview</span>
      {half.map((hundredths, slot) => (
        <Button
          key={slot}
          size="sm"
          variant="secondary"
          className="tnum"
          onClick={() => session.previewDrop(Math.random() < 0.5 ? slot : payouts.length - 1 - slot, stakeMinor)}
        >
          {formatMultiplier(hundredths)}
        </Button>
      ))}
    </div>
  )
}

function FairGameDialog({ open, onClose, session }: { open: boolean; onClose: () => void; session: GameSession | null }) {
  const payouts = session?.board?.[session.params.risk] ?? null

  return (
    <Modal open={open} onClose={onClose} title="Fair game" size="sm">
      <dl className="flex flex-col gap-3 text-[13.5px]">
        {session && payouts ? (
          <div className="flex flex-col gap-2">
            <dt className="text-ink-mute">
              Payouts · {session.params.rows} rows · {riskLabels[session.params.risk]}
            </dt>
            <dd className="grid grid-cols-3 gap-1.5 min-[400px]:grid-cols-5">
              {payouts.map((hundredths, slot) => (
                <span
                  key={slot}
                  className="rounded-chip bg-inset px-2 py-1.5 text-center text-[12px] text-ink-soft tnum"
                >
                  {formatMultiplier(hundredths)}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </Modal>
  )
}

type BetPanelProps = {
  stakeMinor: number
  setStakeMinor: Dispatch<SetStateAction<number>>
  balance: Money | null
  currency: Currency
  minMinor: number
  maxMinor: number
  stepMinor: number
  // Present only for a title with an engine; every other game keeps the display slot.
  session: GameSession | null
  paramsSlot: ReactNode
  shortfall: boolean
  onShortfall: (open: boolean) => void
}

function BetPanel({
  stakeMinor,
  setStakeMinor,
  balance,
  currency,
  minMinor,
  maxMinor,
  stepMinor,
  session,
  paramsSlot,
  shortfall,
  onShortfall,
}: BetPanelProps) {
  const toast = useToast()
  const busy = session?.playing ?? false
  // A title with an engine offers a bet only once its board is configured from the
  // server's manifest.
  const offered = session ? session.canPlay : true
  const ladder = stakeLadder({ min: minMinor, max: maxMinor, step: stepMinor })

  const place = () => {
    if (!balance || stakeMinor > balance.amount_minor) {
      onShortfall(true)
      return
    }
    if (!session) {
      toast.push("This game isn't available to play yet.")
      return
    }
    void session.play(stakeMinor)
  }

  // Space drops a ball unless focus is in a control or a dialog.
  const placeRef = useRef(place)
  useLayoutEffect(() => {
    placeRef.current = place
  })
  const ready = offered && !busy
  useEffect(() => {
    if (!ready) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button, a, [contenteditable], [role="dialog"], [role="menu"]')) return
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if ([...dialogs].some((dialog) => !dialog.closest('[inert]'))) return
      event.preventDefault()
      placeRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ready])

  return (
    <section
      aria-label="Bet controls"
      data-part="bet-panel"
      className="glass-panel flex flex-col gap-2 rounded-card p-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),var(--shadow-panel)] sm:gap-2.5 sm:p-3"
    >
      <div className="flex items-center gap-2.5 game-side:flex-col game-side:items-stretch">
        <div data-part="balance" className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            aria-hidden
            data-part="wallet-tile"
            className="flex size-10 shrink-0 items-center justify-center rounded-input border border-hairline bg-inset text-ink-control max-[379px]:hidden sm:size-10.5"
          >
            <Wallet size={19} strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <div data-part="balance-label" className="label-mono text-[10px] text-ink-cool">
              Balance
            </div>
            <div data-part="balance-value" className="truncate text-[16px] leading-tight font-medium text-ink tnum sm:text-[18px]">
              {balance ? formatMoney(balance) : '—'}
            </div>
          </div>
        </div>
        {paramsSlot}
      </div>

      <div className="flex gap-2 sm:gap-2.5 game-side:flex-col">
        <div
          data-part="stepper"
          className="flex h-10 min-w-0 flex-1 items-stretch overflow-hidden rounded-input border border-hairline bg-field sm:h-12 sm:min-w-[168px] game-side:flex-none">
          <button
            type="button"
            aria-label="Decrease bet"
            data-part="step-button"
            onClick={() => setStakeMinor((value) => stepStake(ladder, value, -1))}
            className="flex w-10 shrink-0 items-center justify-center bg-inset text-ink-control transition-colors duration-fast hover:bg-wash sm:w-12"
          >
            <Minus aria-hidden size={16} strokeWidth={2.4} />
          </button>
          <div
            data-part="stake-value"
            className="flex min-w-0 flex-1 items-center justify-center border-x border-hairline px-0.5 text-[15px] font-medium text-ink tnum sm:text-[18px]">
            <span className="truncate">{formatMoney(money(stakeMinor, currency))}</span>
          </div>
          <button
            type="button"
            aria-label="Increase bet"
            data-part="step-button"
            onClick={() => setStakeMinor((value) => stepStake(ladder, value, 1))}
            className="flex w-10 shrink-0 items-center justify-center bg-inset text-ink-control transition-colors duration-fast hover:bg-wash sm:w-12"
          >
            <Plus aria-hidden size={16} strokeWidth={2.4} />
          </button>
        </div>

        <Button
          variant="play"
          onClick={place}
          disabled={busy || !offered}
          className="min-w-0 flex-1 gap-2 sm:gap-2.5 game-side:flex-none"
        >
          PLACE BET
          <svg aria-hidden viewBox="0 0 18 20" className="h-3.5 w-3 shrink-0 sm:h-4 sm:w-3.5">
            <polygon points="2,1 17,10 2,19" fill="currentColor" />
          </svg>
        </Button>
      </div>

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
            <Link to={paths.deposit} onClick={() => onShortfall(false)} className={buttonStyles('primary', 'md')}>
              Deposit
            </Link>
          </div>
        }
      >
        <dl className="flex flex-col gap-2 text-[13.5px]">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-mute">Stake</dt>
            <dd className="font-medium tnum">{formatMoney(money(stakeMinor, currency))}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-mute">Balance</dt>
            <dd className="font-medium tnum">{balance ? formatMoney(balance) : '—'}</dd>
          </div>
        </dl>
      </Modal>
    </section>
  )
}
