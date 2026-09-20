import { Globe, LifeBuoy, X } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'

import { paths } from '@/routes/paths'

import { FutureDevelopmentRow } from './FutureDevelopmentRow'
import { NavList } from './NavList'
import { playerNav } from './nav'
import { RailSearch } from './RailSearch'
import { useShell } from './ShellContext'

export function MobileDrawer() {
  const { drawerOpen, setDrawerOpen } = useShell()

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
          <RailSearch mode="expanded" onNavigate={close} />
        </div>

        <nav className="flex-1 overflow-y-auto px-2">
          <NavList items={playerNav} onNavigate={close} />
        </nav>

        <div className="flex flex-col gap-px p-2">
          <FutureDevelopmentRow icon={LifeBuoy} label="Support" placement="above" />
          <FutureDevelopmentRow icon={Globe} label="English" placement="above" />
        </div>
      </div>
    </div>
  )
}
