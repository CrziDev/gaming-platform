import { Link } from 'react-router'

import type { Game } from '@/api/types'
import { useAuthIntent, useSession } from '@/features/auth'
import { paths } from '@/routes/paths'

export function GameCard({ game }: { game: Game }) {
  const { data: user } = useSession()
  const { open } = useAuthIntent()

  const card = (
    <>
      <span className="relative flex aspect-3/4 items-end overflow-hidden rounded-tile bg-surface-3">
        <span
          aria-hidden
          className="label-mono absolute inset-x-0 bottom-[40%] text-center text-[9.5px] text-ink-mute"
        >
          game art
        </span>
        <span className="tile-scrim relative w-full truncate p-2 text-[12px] font-medium text-ink-soft">
          {game.name}
        </span>
        <span className="absolute inset-0 flex items-center justify-center bg-base/60 opacity-0 transition-opacity duration-[120ms] ease-standard group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="rounded-chip bg-accent px-4 py-1.5 text-[12.5px] font-semibold text-on-accent">
            Play
          </span>
        </span>
      </span>
      <span className="truncate text-[11px] text-ink-mute">{game.provider}</span>
    </>
  )

  const className = 'group flex w-full flex-col gap-1.5 text-left text-ink-soft'

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
