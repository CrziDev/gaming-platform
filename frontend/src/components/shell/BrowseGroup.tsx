import { ChevronDown, Layers } from 'lucide-react'
import { NavLink } from 'react-router'

import { useCategories } from '@/features/catalogue'
import { cn } from '@/lib/cn'
import { useRemembered } from '@/lib/remembered'
import { paths } from '@/routes/paths'

import { CategoryIcon } from './CategoryIcon'

type BrowseGroupProps = {
  collapsed?: boolean
  onNavigate?: () => void
}

export function BrowseGroup({ collapsed = false, onNavigate }: BrowseGroupProps) {
  const { data: categories } = useCategories()
  const [open, setOpen] = useRemembered('shell.browse-open', true)

  if (!categories || categories.length === 0) {
    return null
  }

  const total = categories.reduce((sum, category) => sum + category.game_count, 0)

  const shape =
    'flex min-h-11 items-center gap-3 rounded-input text-[13px] transition-colors duration-[120ms]'

  const entries = [
    { slug: '', name: 'All games', count: total, to: paths.games, end: true },
    ...categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      count: category.game_count,
      to: `${paths.games}?category=${category.slug}`,
      end: false,
    })),
  ]

  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3">
      {collapsed ? null : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-h-11 items-center gap-2 rounded-input px-3 text-ink-mute transition-colors duration-[120ms] hover:text-ink"
        >
          <span className="label-mono">Browse</span>
          <ChevronDown
            aria-hidden
            size={14}
            strokeWidth={1.5}
            className={cn('ml-auto transition-transform duration-[120ms]', open && 'rotate-180')}
          />
        </button>
      )}

      {collapsed || open
        ? entries.map((entry) => (
            <NavLink
              key={entry.to}
              to={entry.to}
              end={entry.end}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              {...(collapsed ? { title: entry.name } : {})}
              className={({ isActive }) =>
                cn(
                  shape,
                  collapsed ? 'justify-center px-0' : 'px-3',
                  entry.end && isActive
                    ? 'bg-accent/12 text-accent'
                    : 'text-ink-mute hover:text-ink',
                )
              }
            >
              {entry.slug === '' ? (
                <Layers aria-hidden size={16} strokeWidth={1.5} />
              ) : (
                <CategoryIcon slug={entry.slug} size={16} />
              )}
              {collapsed ? (
                <span className="sr-only">{entry.name}</span>
              ) : (
                <>
                  {entry.name}
                  <span className="ml-auto font-mono text-[11px]">{entry.count}</span>
                </>
              )}
            </NavLink>
          ))
        : null}
    </div>
  )
}
