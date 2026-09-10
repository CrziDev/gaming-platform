import { ExternalLink, Globe, LifeBuoy, Search } from 'lucide-react'

import { cn } from '@/lib/cn'

import { BrowseGroup } from './BrowseGroup'
import { NavList } from './NavList'
import { playerNav } from './nav'
import { useShell } from './ShellContext'

export function Sidebar() {
  const { railCollapsed, setSearchOpen } = useShell()

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        'sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col border-r border-line bg-panel lg:flex',
        railCollapsed ? 'w-18' : 'w-70',
      )}
    >
      <div className="border-b border-line p-3">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className={cn(
            'flex min-h-11 w-full items-center gap-2.5 rounded-input border border-line bg-surface-1 text-ink-mute',
            'transition-colors duration-[120ms] hover:border-line-strong hover:text-ink',
            railCollapsed ? 'justify-center px-0' : 'px-3',
          )}
        >
          <Search aria-hidden size={16} strokeWidth={1.5} />
          {railCollapsed ? (
            <span className="sr-only">Search games</span>
          ) : (
            <>
              <span className="text-[13px]">Search games</span>
              <kbd className="ml-auto rounded-chip border border-line px-1.5 py-0.5 font-mono text-[10.5px]">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        <NavList items={playerNav} collapsed={railCollapsed} />
        <BrowseGroup collapsed={railCollapsed} />
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-line p-3">
        <a
          href="https://support.example.com"
          target="_blank"
          rel="noreferrer"
          className={cn(
            'flex min-h-11 items-center gap-3 rounded-input text-[13px] text-ink-mute hover:text-ink',
            railCollapsed ? 'justify-center px-0' : 'px-3',
          )}
        >
          <LifeBuoy aria-hidden size={16} strokeWidth={1.5} />
          {railCollapsed ? (
            <span className="sr-only">Support</span>
          ) : (
            <>
              Support
              <ExternalLink aria-hidden size={13} strokeWidth={1.5} className="ml-auto" />
            </>
          )}
        </a>

        <button
          type="button"
          className={cn(
            'flex min-h-11 items-center gap-3 rounded-input text-[13px] text-ink-mute hover:text-ink',
            railCollapsed ? 'justify-center px-0' : 'px-3',
          )}
        >
          <Globe aria-hidden size={16} strokeWidth={1.5} />
          {railCollapsed ? <span className="sr-only">Language</span> : 'English'}
        </button>

        {railCollapsed ? null : (
          <span className="px-3 pt-2 font-mono text-[10px] text-ink-faint">v1.0 · Phase 1</span>
        )}
      </div>
    </aside>
  )
}
