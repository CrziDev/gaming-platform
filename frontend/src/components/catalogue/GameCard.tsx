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
      <div className="relative aspect-3/4 overflow-hidden">
        <GameArt seed={game.art_seed} className="size-full" />
        <span className="absolute inset-0 flex items-center justify-center bg-[#06090f]/62 opacity-0 transition-opacity duration-[120ms] ease-standard group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="rounded-full bg-accent px-5 py-2 font-display text-[13px] font-bold text-on-accent">
            Play
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <span className="truncate text-[13px] font-semibold text-ink">{game.name}</span>
        <span className="truncate font-mono text-[10px] tracking-[0.1em] text-ink-mute uppercase">
          {game.category_name}
        </span>
      </div>
    </>
  )

  const className =
    'group flex w-full flex-col overflow-hidden rounded-card border border-line bg-surface-2 text-left ' +
    'transition-[border-color,box-shadow] duration-[120ms] ease-standard hover:border-accent hover:shadow-e1'

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
