import { Globe, LifeBuoy } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/cn'

import { FutureDevelopmentRow } from './FutureDevelopmentRow'
import { NavList } from './NavList'
import { playerNav } from './nav'
import { railMode, railWidth } from './rail'
import { RailSearch } from './RailSearch'
import { useShell } from './ShellContext'

export function Sidebar() {
  const { rail, expandRail, collapseRail } = useShell()
  const mode = railMode(rail)
  const sidebar = useRef<HTMLElement>(null)

  useEffect(() => {
    if (rail !== 'expanded') {
      return
    }

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || sidebar.current?.contains(target)) {
        return
      }
      if (target instanceof Element && target.closest('[data-navigation-toggle]')) {
        return
      }
      collapseRail()
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [collapseRail, rail])

  return (
    <aside
      ref={sidebar}
      aria-label="Main navigation"
      onPointerEnter={expandRail}
      onFocusCapture={expandRail}
      data-state={mode}
      className={cn(
        'glass-chrome hidden shrink-0 flex-col gap-3 overflow-x-clip overflow-y-auto border-r border-hairline px-2 py-3 @rail:flex',
        'transition-[width] duration-layout ease-standard motion-reduce:transition-none',
        railWidth[mode],
      )}
    >
      <RailSearch mode={mode} />

      <nav>
        <NavList items={playerNav} mode={mode} />
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col gap-px">
        <FutureDevelopmentRow icon={LifeBuoy} label="Support" mode={mode} placement="right" />
        <FutureDevelopmentRow icon={Globe} label="English" mode={mode} placement="right" />
      </div>
    </aside>
  )
}
