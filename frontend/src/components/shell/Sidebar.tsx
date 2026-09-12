import { Globe, LifeBuoy, Search } from 'lucide-react'

import { cn } from '@/lib/cn'

import { NavList } from './NavList'
import { playerNav } from './nav'
import { railLabel, railMode, railRow, railWidth } from './rail'
import { useShell } from './ShellContext'

export function Sidebar() {
  const { rail, setSearchOpen } = useShell()
  const mode = railMode(rail)

  const footerRow = cn(
    'flex min-h-11 items-center gap-2.75 rounded-input px-2.75 text-[13px] text-ink-mute transition-colors duration-[120ms] hover:text-ink-soft lg:min-h-8',
    railRow[mode],
  )

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        'hidden shrink-0 flex-col gap-3 overflow-y-auto bg-panel px-2 py-3 @rail:flex',
        railWidth[mode],
      )}
    >
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className={cn(
          'flex min-h-11 w-full items-center gap-2.5 rounded-input bg-inset px-2.5 text-[13px] text-ink-mute',
          'transition-colors duration-[120ms] hover:bg-wash hover:text-ink-soft lg:min-h-[34px]',
          railRow[mode],
        )}
      >
        <Search aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
        <span className={railLabel[mode]}>Search games</span>
      </button>

      <nav>
        <NavList items={playerNav} mode={mode} />
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-px">
        <a href="https://support.example.com" target="_blank" rel="noreferrer" className={footerRow}>
          <LifeBuoy aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
          <span className={railLabel[mode]}>Support</span>
        </a>

        <button type="button" className={footerRow}>
          <Globe aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
          <span className={railLabel[mode]}>English</span>
        </button>
      </div>
    </aside>
  )
}
