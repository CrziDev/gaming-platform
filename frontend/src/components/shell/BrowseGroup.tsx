import { ChevronDown, Layers } from 'lucide-react'
import { NavLink } from 'react-router'

import { useCategories } from '@/features/catalogue'
import { cn } from '@/lib/cn'
import { useRemembered } from '@/lib/remembered'
import { paths } from '@/routes/paths'

import { CategoryIcon } from './CategoryIcon'
import { railLabel, railRow, type RailMode } from './rail'

type BrowseGroupProps = {
  mode?: RailMode
  onNavigate?: () => void
}

export function BrowseGroup({ mode = 'expanded', onNavigate }: BrowseGroupProps) {
  const { data: categories } = useCategories()
  const [open, setOpen] = useRemembered('shell.browse-open', true)

  if (!categories || categories.length === 0) {
    return null
  }

  const shape = cn(
    'flex min-h-11 items-center gap-2.75 rounded-input px-2.75 text-[13.5px] transition-colors duration-[120ms] lg:min-h-9',
    railRow[mode],
  )

  const entries = [
    { slug: '', name: 'All games', to: paths.games, end: true },
    ...categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      to: `${paths.games}?category=${category.slug}`,
      end: false,
    })),
  ]

  const showEntries = mode !== 'expanded' || open

  return (
    <div className="flex flex-col gap-px">
      {mode === 'expanded' ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-h-11 items-center gap-2 rounded-input px-2.75 text-ink-mute transition-colors duration-[120ms] hover:text-ink-soft lg:min-h-9"
        >
          <span className="label-mono">Browse</span>
          <ChevronDown aria-hidden size={14} strokeWidth={1.5} className={cn('ml-auto', open && 'rotate-180')} />
        </button>
      ) : null}

      {showEntries
        ? entries.map((entry) => (
            <NavLink
              key={entry.to}
              to={entry.to}
              end={entry.end}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              {...(mode === 'expanded' ? {} : { title: entry.name })}
              className={({ isActive }) =>
                cn(
                  shape,
                  entry.end && isActive
                    ? 'bg-wash font-medium text-ink-soft'
                    : 'text-ink-mute hover:bg-wash hover:text-ink-soft',
                )
              }
            >
              {entry.slug === '' ? (
                <Layers aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
              ) : (
                <CategoryIcon slug={entry.slug} size={16} className="shrink-0" />
              )}
              <span className={railLabel[mode]}>{entry.name}</span>
            </NavLink>
          ))
        : null}
    </div>
  )
}
