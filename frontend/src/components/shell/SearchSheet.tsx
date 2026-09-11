import { ChevronRight, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { GameArt } from '@/components/catalogue/GameArt'
import { Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useGames } from '@/features/catalogue'
import { paths } from '@/routes/paths'

import { useShell } from './ShellContext'

export function SearchSheet() {
  const { searchOpen, setSearchOpen } = useShell()
  const [term, setTerm] = useState('')
  const navigate = useNavigate()

  const { data: games } = useGames({ category: 'all', search: term, sort: 'name' })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setSearchOpen])

  if (!searchOpen) {
    return null
  }

  const close = () => {
    setSearchOpen(false)
    setTerm('')
  }

  const open = async (slug: string) => {
    close()
    await navigate(paths.game(slug))
  }

  const showAll = async () => {
    const query = term.trim()
    close()
    await navigate(query === '' ? paths.games : `${paths.games}?q=${encodeURIComponent(query)}`)
  }

  return (
    <Modal open onClose={() => setSearchOpen(false)} title="Search games" size="lg">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search
            aria-hidden
            size={16}
            strokeWidth={1.5}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-mute"
          />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void showAll()
              }
            }}
            placeholder="Game name or category"
            aria-label="Search games"
            className="pl-9"
          />
        </div>

        {games && games.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {games.map((game) => (
              <li key={game.id}>
                <button
                  type="button"
                  onClick={() => void open(game.slug)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-tile px-2 text-left transition-colors duration-[120ms] hover:bg-surface-1"
                >
                  <GameArt className="size-10 rounded-chip" />
                  <span className="flex flex-col">
                    <span className="text-[13px] font-medium text-ink-soft">{game.name}</span>
                    <span className="label-mono text-ink-mute">
                      {game.category_name}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 py-6 text-center text-[13.5px] text-ink-mute">No games match that search.</p>
        )}

        <button
          type="button"
          onClick={() => void showAll()}
          className="flex min-h-11 items-center justify-center gap-1 rounded-input text-[12.5px] font-medium text-accent-ink transition-colors duration-[120ms] hover:bg-wash lg:min-h-9"
        >
          {term.trim() === ''
            ? 'Browse all games'
            : `Show all ${games?.length ?? 0} results in Games`}
          <ChevronRight aria-hidden size={14} strokeWidth={1.5} />
        </button>
      </div>
    </Modal>
  )
}
