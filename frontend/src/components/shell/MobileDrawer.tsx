import { Globe, LifeBuoy, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/cn'
import { paths } from '@/routes/paths'

import { FutureDevelopmentRow } from './FutureDevelopmentRow'
import { NavList } from './NavList'
import { playerNav } from './nav'
import { RailSearch } from './RailSearch'
import { useShell } from './ShellContext'

export function MobileDrawer() {
  const { drawerOpen, setDrawerOpen } = useShell()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!drawerOpen) {
      return
    }
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const targets = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!targets || targets.length === 0) return
      const first = targets[0]
      const last = targets[targets.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [drawerOpen, setDrawerOpen])

  const close = () => setDrawerOpen(false)

  return (
    <div
      className={cn('fixed inset-0 z-50 flex rail:hidden', !drawerOpen && 'pointer-events-none')}
      aria-hidden={!drawerOpen}
      inert={!drawerOpen}
    >
      <button
        type="button"
        aria-label="Close navigation"
        onClick={close}
        className={cn(
          'absolute inset-0 bg-base/70 transition-opacity duration-standard ease-standard motion-reduce:transition-none',
          drawerOpen ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          'overlay-shadow relative flex w-72 max-w-[85vw] flex-col bg-panel transition-[transform,opacity] duration-layout ease-standard motion-reduce:transition-none',
          drawerOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0',
        )}
      >
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
          <RailSearch mode="expanded" onNavigate={close} active={drawerOpen} />
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
