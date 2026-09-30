import { Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import type { AdminDeposit, AdminRound, AdminUser } from '@/api/types'
import { IconButton } from '@/components/ui/Button'
import { useConsoleSearch } from '@/features/admin'
import { cn } from '@/lib/cn'
import { formatMoney, money } from '@/lib/money'
import { adminPaths } from '@/routes/paths'

type SearchOption = {
  key: string
  group: 'Players' | 'Payment references' | 'Rounds'
  title: string
  meta: string
  destination: string
}

export function AdminConsoleSearch() {
  const navigate = useNavigate()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(-1)
  const results = useConsoleSearch(debounced)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setFocused(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const options = useMemo(() => toOptions(results.data), [results.data])
  const expanded = focused && query.trim().length >= 2

  const choose = (option: SearchOption) => {
    setQuery('')
    setDebounced('')
    setFocused(false)
    setMobileOpen(false)
    void navigate(option.destination)
  }

  const closeMobile = () => {
    setMobileOpen(false)
    setFocused(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        label="Search the console"
        onClick={() => {
          setMobileOpen(true)
          window.setTimeout(() => inputRef.current?.focus())
        }}
        className="bg-inset lg:hidden"
      >
        <Search aria-hidden size={16} strokeWidth={1.5} />
      </IconButton>

      {mobileOpen ? (
        <button type="button" aria-label="Close search" onClick={closeMobile} className="fixed inset-0 z-40 bg-base/70 lg:hidden" />
      ) : null}

      <div
        className={cn(
          'z-50 w-[min(34rem,calc(100vw-1.5rem))]',
          mobileOpen ? 'fixed top-2 right-3 left-3' : 'hidden',
          'lg:relative lg:top-auto lg:right-auto lg:left-auto lg:block lg:w-80',
        )}
      >
        <label className="overlay-shadow flex min-w-0 items-center gap-2.5 rounded-input border border-hairline bg-field px-2.5 lg:shadow-none">
          <Search aria-hidden size={15} strokeWidth={1.5} className="shrink-0 text-ink-mute" />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            value={query}
            placeholder="Search player, ref or round id"
            aria-label="Search the console"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            onFocus={() => setFocused(true)}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(-1)
              setFocused(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                if (mobileOpen) closeMobile()
                else setFocused(false)
                return
              }
              if (options.length === 0) return
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((current) => (current + 1) % options.length)
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((current) => (current <= 0 ? options.length - 1 : current - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                choose(options[active >= 0 ? active : 0] as SearchOption)
              }
            }}
            className="min-h-11 min-w-0 flex-1 bg-transparent text-[13px] text-ink-soft placeholder:text-ink-mute focus:outline-none lg:min-h-[34px]"
          />
          {mobileOpen ? (
            <button type="button" aria-label="Close search" onClick={closeMobile} className="flex size-9 items-center justify-center text-ink-mute lg:hidden">
              <X aria-hidden size={16} />
            </button>
          ) : null}
        </label>

        {expanded ? (
          <div id={listId} role="listbox" className="pop-enter glass-menu absolute top-[calc(100%+0.35rem)] right-0 left-0 max-h-[min(30rem,70dvh)] overflow-y-auto rounded-card p-2">
            {debounced.length < 2 || results.isPending ? (
              <p className="px-3 py-4 text-[13px] text-ink-mute">Searching…</p>
            ) : results.isError ? (
              <p role="alert" className="px-3 py-4 text-[13px] text-danger">Console search is unavailable.</p>
            ) : options.length === 0 ? (
              <p className="px-3 py-4 text-[13px] text-ink-mute">No players, payment references, or rounds match.</p>
            ) : (
              <SearchOptions options={options} active={active} listId={listId} onChoose={choose} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SearchOptions({
  options,
  active,
  listId,
  onChoose,
}: {
  options: SearchOption[]
  active: number
  listId: string
  onChoose: (option: SearchOption) => void
}) {
  let previous: SearchOption['group'] | undefined
  return options.map((option, index) => {
    const heading = option.group !== previous
    previous = option.group
    return (
      <div key={option.key}>
        {heading ? <p className="label-mono px-3 pt-2 pb-1 text-ink-mute">{option.group}</p> : null}
        <button
          id={`${listId}-${index}`}
          type="button"
          role="option"
          aria-selected={active === index}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChoose(option)}
          className={cn(
            'flex w-full flex-col rounded-input px-3 py-2 text-left',
            active === index ? 'bg-wash' : 'hover:bg-wash',
          )}
        >
          <span className="truncate text-[13px] font-medium text-ink-soft">{option.title}</span>
          <span className="truncate text-[11.5px] text-ink-mute">{option.meta}</span>
        </button>
      </div>
    )
  })
}

function toOptions(data: { players: AdminUser[]; deposits: AdminDeposit[]; rounds: AdminRound[] } | undefined): SearchOption[] {
  if (!data) return []
  return [
    ...data.players.map((player) => ({
      key: `player-${player.id}`,
      group: 'Players' as const,
      title: player.display_name,
      meta: `${player.email} · ${player.status} · ${player.id.slice(0, 8)}`,
      destination: adminPaths.user(player.id),
    })),
    ...data.deposits.map((deposit) => ({
      key: `deposit-${deposit.id}`,
      group: 'Payment references' as const,
      title: `Ref ${deposit.reference}`,
      meta: `${deposit.username} · ${deposit.method_name} · ${deposit.status} · ${formatMoney(money(deposit.amount_minor, deposit.currency))}`,
      destination: `${adminPaths.deposits}?search=${encodeURIComponent(deposit.id)}`,
    })),
    ...data.rounds.map((round) => ({
      key: `round-${round.id}`,
      group: 'Rounds' as const,
      title: `Round ${round.id.slice(0, 8)}`,
      meta: `${round.display_name || round.user_email} · ${round.game_name} · ${round.status}`,
      destination: `${adminPaths.rounds}?search=${encodeURIComponent(round.id)}`,
    })),
  ]
}
