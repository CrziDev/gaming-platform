import { ExternalLink, Globe, LifeBuoy, Search, X } from 'lucide-react'
import { useEffect } from 'react'

import { BrowseGroup } from './BrowseGroup'
import { NavList } from './NavList'
import { playerNav } from './nav'
import { useShell } from './ShellContext'

export function MobileDrawer() {
  const { drawerOpen, setDrawerOpen, setSearchOpen } = useShell()

  useEffect(() => {
    if (!drawerOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen, setDrawerOpen])

  if (!drawerOpen) {
    return null
  }

  const close = () => setDrawerOpen(false)

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={close}
        className="absolute inset-0 bg-[#06090f]/70"
      />

      <div className="relative flex w-80 max-w-[85vw] flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-3 p-4">
          <span className="size-7 rounded-[9px] bg-accent" />
          <span className="font-display text-[15px] font-semibold">Gaming Platform</span>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={close}
            className="ml-auto flex size-11 items-center justify-center rounded-input text-ink-mute hover:text-ink"
          >
            <X aria-hidden size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              close()
              setSearchOpen(true)
            }}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-input border border-line bg-surface-1 px-3 text-[13.5px] text-ink-mute"
          >
            <Search aria-hidden size={16} strokeWidth={1.5} />
            Search games
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-3">
          <NavList items={playerNav} onNavigate={close} />
          <BrowseGroup onNavigate={close} />
        </nav>

        <div className="flex flex-col gap-0.5 border-t border-line p-3">
          <a
            href="https://support.example.com"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center gap-3 rounded-input px-3 text-[13px] text-ink-mute"
          >
            <LifeBuoy aria-hidden size={16} strokeWidth={1.5} />
            Support
            <ExternalLink aria-hidden size={13} strokeWidth={1.5} className="ml-auto" />
          </a>
          <button
            type="button"
            className="flex min-h-11 items-center gap-3 rounded-input px-3 text-[13px] text-ink-mute"
          >
            <Globe aria-hidden size={16} strokeWidth={1.5} />
            English
          </button>
        </div>
      </div>
    </div>
  )
}
