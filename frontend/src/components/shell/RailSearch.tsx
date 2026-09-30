import { ChevronRight, Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router'

import type { Game } from '@/api/types'
import { GameArt } from '@/components/catalogue/GameArt'
import { Input } from '@/components/ui/Field'
import { useAuthIntent, useSession } from '@/features/auth'
import { useGameSearch } from '@/features/catalogue'
import { cn } from '@/lib/cn'
import { gameArtUrl } from '@/lib/gameArt'
import { paths } from '@/routes/paths'

import { railNarrow, railRow, railWide, type RailMode } from './rail'
import { useShell } from './ShellContext'

const RESULT_ROWS = 8

type RailSearchProps = {
  mode: RailMode
  onNavigate?: () => void
  active?: boolean
}

export function RailSearch({ mode, onNavigate, active = true }: RailSearchProps) {
  const { search, setSearch, searchFocus, focusSearch, searchFocused } = useShell()
  const input = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const term = search.trim()
  const results = useGameSearch(search)

  useEffect(() => {
    if (!active || searchFocus === 0) {
      return
    }
    input.current?.focus()
    searchFocused()
  }, [active, searchFocus, searchFocused])

  const showAll = async () => {
    if (term === '') {
      return
    }
    onNavigate?.()
    await navigate(catalogueSearch(term))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative min-h-11 lg:min-h-[34px]">
        <button
          type="button"
          title="Search games"
          onFocus={focusSearch}
          onClick={focusSearch}
          className={cn(
            'absolute inset-0 flex w-full items-center gap-2.5 rounded-input border border-hairline bg-field px-2.5 text-[13px] text-ink-mute',
            'transition-[color,background-color,opacity,transform] duration-standard ease-standard hover:bg-wash hover:text-ink-soft',
            railRow[mode],
            railNarrow[mode],
          )}
        >
          <Search aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
          <span className="sr-only">Search games</span>
        </button>

        <div
          className={cn(
            'absolute inset-0 transition-[opacity,transform] duration-standard ease-standard motion-reduce:transition-none',
            railWide[mode],
          )}
        >
          <Search
            aria-hidden
            size={16}
            strokeWidth={1.5}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-mute"
          />
          <Input
            ref={input}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void showAll()
              }
            }}
            placeholder="Search games"
            aria-label="Search games"
            autoComplete="off"
            className={cn(
              'pl-8 text-[13px] [&::-webkit-search-cancel-button]:appearance-none',
              term !== '' && 'pr-9',
            )}
          />
          {term === '' ? null : (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearch('')
                input.current?.focus()
              }}
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-mute hover:text-ink-soft"
            >
              <X aria-hidden size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {mode === 'collapsed' || term === '' ? null : (
        <div className="pop-enter">
          <SearchResults
            games={results.data}
            error={results.isError}
            loading={results.isPending}
            term={term}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  )
}

type SearchResultsProps = {
  games: Game[] | undefined
  error: boolean
  loading: boolean
  term: string
  onNavigate?: (() => void) | undefined
}

function SearchResults({ games, error, loading, term, onNavigate }: SearchResultsProps) {
  const { data: user } = useSession()
  const { open } = useAuthIntent()

  if (error) {
    return <p className={note}>Search is unavailable</p>
  }

  if (loading) {
    return (
      <div aria-hidden className="flex flex-col gap-px">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="min-h-11 rounded-input bg-surface-2 lg:min-h-9" />
        ))}
      </div>
    )
  }

  if (!games || games.length === 0) {
    return <p className={note}>No games match</p>
  }

  return (
    <div className="flex flex-col gap-px">
      <ul aria-label="Search results" className="flex flex-col gap-px">
        {games.slice(0, RESULT_ROWS).map((game) => {
          const body = (
            <>
              <GameArt src={gameArtUrl(game)} caption="" className="size-7 shrink-0 rounded-chip" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium">{game.name}</span>
                <span className="label-mono truncate text-ink-mute">{game.category_name}</span>
              </span>
            </>
          )

          return (
            <li key={game.id}>
              {user ? (
                <Link
                  to={paths.game(game.slug)}
                  {...(onNavigate ? { onClick: onNavigate } : {})}
                  className={row}
                >
                  {body}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate?.()
                    open({ tab: 'signin', redirectTo: paths.game(game.slug), context: game.name })
                  }}
                  className={cn(row, 'w-full text-left')}
                >
                  {body}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <Link
        to={catalogueSearch(term)}
        {...(onNavigate ? { onClick: onNavigate } : {})}
        className="flex min-h-11 items-center gap-1 rounded-input px-2.5 text-[12.5px] font-medium text-accent-ink transition-colors duration-fast hover:bg-wash lg:min-h-9"
      >
        See all results
        <ChevronRight aria-hidden size={14} strokeWidth={1.5} />
      </Link>
    </div>
  )
}

const row =
  'flex min-h-11 items-center gap-2.5 rounded-input px-2 text-ink-soft transition-colors duration-fast hover:bg-wash lg:min-h-9'

const note = 'px-2.5 py-2 text-[12.5px] text-ink-mute'

function catalogueSearch(term: string): string {
  return `${paths.games}?q=${encodeURIComponent(term)}`
}
