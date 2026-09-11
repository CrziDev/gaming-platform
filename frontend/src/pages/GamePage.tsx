import { ChevronLeft, Maximize2, Minimize2, Settings, ShieldCheck, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, useParams } from 'react-router'

import { GameRow } from '@/components/catalogue/GameRow'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { MoneyDisplay } from '@/components/ui/MoneyDisplay'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/States'
import { ChipTabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useGame, useGames } from '@/features/catalogue'
import { useWallet } from '@/features/wallet'
import { rounds } from '@/mocks/wallet'
import { cn } from '@/lib/cn'
import { formatClockSeconds, formatMultiplier } from '@/lib/format'
import { formatMoney, money, type Money } from '@/lib/money'
import { paths } from '@/routes/paths'

const recentRounds = rounds.slice(0, 6)

export function GamePage() {
  const { slug = '' } = useParams()
  const gameQuery = useGame(slug)
  const game = gameQuery.data
  // A title is denominated in one currency, so the balance beside the bet
  // controls is that wallet's — never whichever one the header happens to show.
  const { data: wallet } = useWallet(game?.currency ?? 'PHP')
  const catalogue = useGames({ category: 'all', search: '', sort: 'name' })
  const hostRef = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

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

  const related = (catalogue.data ?? []).filter(
    (entry) => entry.category_slug === game.category_slug && entry.id !== game.id,
  )

  return (
    <div className="flex flex-col gap-8">
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

        <Button variant="ghost" size="sm" onClick={() => void toggleFullscreen()}>
          {fullscreen ? (
            <Minimize2 aria-hidden size={15} strokeWidth={1.5} />
          ) : (
            <Maximize2 aria-hidden size={15} strokeWidth={1.5} />
          )}
          <span className="hidden sm:inline">{fullscreen ? 'Exit full screen' : 'Full screen'}</span>
        </Button>
      </nav>

      <div className="grid gap-5 wide:grid-cols-[300px_minmax(0,1fr)_300px] wide:items-start">
        <div className="order-2 wide:order-1">
          <BetControls
            balance={wallet ? money(wallet.balance_minor, wallet.currency) : null}
            minMinor={game.min_wager_minor}
            maxMinor={game.max_wager_minor}
            stepMinor={game.wager_step_minor}
          />
        </div>

        <GameHost ref={hostRef} name={game.name} className="order-1 wide:order-2" />

        <div className="order-3">
          <ActivityPanel />
        </div>
      </div>

      {related.length > 0 ? (
        <GameRow title={`More ${game.category_name}`} categorySlug={game.category_slug} games={related} />
      ) : null}
    </div>
  )
}

type GameHostProps = {
  name: string
  className?: string
  ref?: RefObject<HTMLElement | null>
}

function GameHost({ name, className, ref }: GameHostProps) {
  return (
    <section
      ref={ref}
      aria-label={`${name} game canvas`}
      className={cn(
        'relative aspect-4/3 overflow-hidden rounded-card bg-surface-3 wide:aspect-16/10',
        '[&:fullscreen]:aspect-auto [&:fullscreen]:size-full [&:fullscreen]:rounded-none',
        className,
      )}
    >

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
        <span className="label-mono inline-flex items-center gap-1.5 rounded-chip bg-base/70 px-2.5 py-1.5 text-ink-mute">
          <ShieldCheck aria-hidden size={12} strokeWidth={1.5} />
          Fair game
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label="Sound"
            className="flex size-11 items-center justify-center rounded-input bg-base/70 text-ink-mute transition-colors duration-[120ms] hover:text-ink-soft"
          >
            <Volume2 aria-hidden size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Game settings"
            className="flex size-11 items-center justify-center rounded-input bg-base/70 text-ink-mute transition-colors duration-[120ms] hover:text-ink-soft"
          >
            <Settings aria-hidden size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <span className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{name}</span>
        <span className="label-mono text-ink-mute">game canvas · aspect-locked slot</span>
      </div>
    </section>
  )
}

type BetControlsProps = {
  balance: Money | null
  minMinor: number
  maxMinor: number
  stepMinor: number
}

function BetControls({ balance, minMinor, maxMinor, stepMinor }: BetControlsProps) {
  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [stakeMinor, setStakeMinor] = useState(minMinor)
  const [shortfall, setShortfall] = useState(false)
  const toast = useToast()
  const currency = balance?.currency ?? 'PHP'

  // The server accepts only min + n × step, so the selector can only produce that.
  // A stake is player input rather than a financial outcome, but an input the server
  // will refuse is still a broken control.
  const clamp = (value: number) => {
    const bounded = Math.min(Math.max(value, minMinor), maxMinor)
    const steps = Math.round((bounded - minMinor) / stepMinor)
    return minMinor + steps * stepMinor
  }

  const place = () => {
    if (!balance || stakeMinor > balance.amount_minor) {
      setShortfall(true)
      return
    }
    toast.push(`Stake of ${formatMoney(money(stakeMinor, currency))} sent to the game module.`)
  }

  return (
    <section className="flex flex-col gap-4 rounded-card bg-surface-1 p-3.5">
      <ChipTabs
        items={[
          { id: 'manual' as const, label: 'Manual' },
          { id: 'auto' as const, label: 'Auto' },
        ]}
        value={mode}
        onChange={setMode}
        label="Bet mode"
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="label-mono text-ink-mute">Bet amount</span>
          {balance ? (
            <span className="font-mono text-[11px] text-ink-mute">
              balance {formatMoney(balance, { decimals: 'trim' })}
            </span>
          ) : null}
        </div>

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

      <div className="rounded-input bg-inset p-3">
        <p className="font-mono text-[10.5px] leading-relaxed text-ink-mute">
          Game parameter slot — rows, risk or lines come from the game manifest. Games that ship their
          own controls leave this panel empty.
        </p>
      </div>

      <Button variant="play" size="lg" fullWidth onClick={place}>
        PLACE BET
      </Button>

      <Modal
        open={shortfall}
        onClose={() => setShortfall(false)}
        title="Not enough balance"
        description={`This stake is more than your wallet holds. Deposit to keep playing.`}
        footer={
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={() => setShortfall(false)}>
              Change stake
            </Button>
            <Link to={paths.deposit} className="contents">
              <Button onClick={() => setShortfall(false)}>Deposit</Button>
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

function ActivityPanel() {
  const [tab, setTab] = useState<'activity' | 'rules'>('activity')
  const sessionMinor = recentRounds.reduce((total, round) => total + round.result_minor, 0)

  return (
    <section className="flex flex-col gap-4 rounded-card bg-surface-1 p-3.5">
      <ChipTabs
        items={[
          { id: 'activity' as const, label: 'My Activity' },
          { id: 'rules' as const, label: 'Rules' },
        ]}
        value={tab}
        onChange={setTab}
        label="Game side panel"
      />

      {tab === 'activity' ? (
        <>
          <ul className="flex flex-col gap-2.5">
            {recentRounds.map((round) => (
              <li key={round.id} className="flex items-center justify-between gap-3">
                <span className="flex flex-col">
                  <span className="font-mono text-[11.5px] text-ink-mute">
                    {formatClockSeconds(round.created_at)}
                  </span>
                  <span className="text-[13px] text-ink-soft">
                    Bet {formatMoney(money(round.stake_minor, round.currency), { decimals: 'trim' })}
                    {round.multiplier_hundredths
                      ? ` · ${formatMultiplier(round.multiplier_hundredths)}`
                      : ''}
                  </span>
                </span>
                <MoneyDisplay
                  value={money(round.result_minor, round.currency)}
                  tone="auto"
                  sign="always"
                  className="text-[13.5px]"
                />
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-3 rounded-input bg-inset p-3">
            <div className="flex flex-col gap-1">
              <span className="label-mono text-ink-mute">Session</span>
              <MoneyDisplay
                value={money(sessionMinor, 'PHP')}
                tone="auto"
                sign="always"
                className="text-[15px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="label-mono text-ink-mute">Rounds</span>
              <span className="font-mono text-[15px] font-medium tnum">{recentRounds.length}</span>
            </div>
          </div>

          <Link to={paths.history} className="text-[13px] text-accent-ink hover:text-accent-hi">
            Full history →
          </Link>
        </>
      ) : (
        <p className="text-[13.5px] leading-relaxed text-ink-soft">
          Every round is settled by the game engine and written to your history as two entries — the
          stake and, when you win, the return. A stake and its win are never netted into one figure,
          so the ledger always reconciles against your balance.
        </p>
      )}
    </section>
  )
}
