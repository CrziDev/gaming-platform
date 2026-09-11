import { Globe, LifeBuoy, Search, X } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'

import { paths } from '@/routes/paths'

import { BrowseGroup } from './BrowseGroup'
import { NavList } from './NavList'
import { playerNav } from './nav'
import { useShell } from './ShellContext'

const footerRow =
  'flex min-h-11 items-center gap-2.75 rounded-input px-2.75 text-[13px] text-ink-mute hover:text-ink-soft'

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
    <div className="fixed inset-0 z-50 flex rail:hidden">
      <button type="button" aria-label="Close navigation" onClick={close} className="absolute inset-0 bg-base/70" />

      <div className="relative flex w-72 max-w-[85vw] flex-col bg-panel">
        <div className="flex items-center gap-3 px-4 pt-2 pb-1">
          <Link to={paths.lobby} onClick={close} className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
            HeziBet
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={close}
            className="ml-auto flex size-11 items-center justify-center rounded-input text-ink-mute hover:bg-wash hover:text-ink-soft"
          >
            <X aria-hidden size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-2 pb-3">
          <button
            type="button"
            onClick={() => {
              close()
              setSearchOpen(true)
            }}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-input bg-inset px-2.5 text-[13px] text-ink-mute"
          >
            <Search aria-hidden size={16} strokeWidth={1.5} />
            Search games
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-2">
          <NavList items={playerNav} onNavigate={close} />
          <BrowseGroup onNavigate={close} />
        </nav>

        <div className="flex flex-col gap-px p-2">
          <a href="https://support.example.com" target="_blank" rel="noreferrer" className={footerRow}>
            <LifeBuoy aria-hidden size={16} strokeWidth={1.5} />
            Support
          </a>
          <button type="button" className={footerRow}>
            <Globe aria-hidden size={16} strokeWidth={1.5} />
            English
          </button>
        </div>
      </div>
    </div>
  )
}
