import { Link } from 'react-router'

import type { Game } from '@/api/types'
import { GameArt } from '@/components/catalogue/GameArt'
import { useAuthIntent, useSession } from '@/features/auth'
import { paths } from '@/routes/paths'

export function GameCard({ game }: { game: Game }) {
  const { data: user } = useSession()
  const { open } = useAuthIntent()

  const card = (
    <>
      <div className="relative aspect-3/4 overflow-hidden lg:aspect-4/5">
        <GameArt
          seed={game.art_seed}
          name={game.name}
          className="size-full transition-transform duration-[200ms] ease-standard group-hover:scale-[1.04] group-focus-visible:scale-[1.04]"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-base/50 opacity-0 transition-opacity duration-[120ms] ease-standard group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="rounded-full bg-accent px-5 py-2 text-[13px] font-semibold text-on-accent">
            Play
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2">
        <span className="truncate text-[13px] font-semibold text-ink">{game.name}</span>
        <span className="truncate font-mono text-[10px] tracking-[0.1em] text-ink-mute uppercase">
          {game.category_name}
        </span>
      </div>
    </>
  )

  const className =
    'group flex w-full flex-col overflow-hidden rounded-card bg-surface-2 text-left' +
    'transition-[border-color,box-shadow] duration-[120ms] ease-standard  '

  if (!user) {
    return (
      <button
        type="button"
        className={className}
        onClick={() =>
          open({ tab: 'signin', redirectTo: paths.game(game.slug), context: game.name })
        }
      >
        {card}
      </button>
    )
  }

  return (
    <Link to={paths.game(game.slug)} className={className}>
      {card}
    </Link>
  )
}
