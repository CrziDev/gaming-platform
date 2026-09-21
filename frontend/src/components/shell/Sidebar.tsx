import { Globe, LifeBuoy } from 'lucide-react'
import { useRef } from 'react'

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
  const pointerInside = useRef(false)

  const collapseWithoutInteraction = () => {
    if (!pointerInside.current && !sidebar.current?.contains(document.activeElement)) {
      collapseRail()
    }
  }

  return (
    <aside
      ref={sidebar}
      aria-label="Main navigation"
      onPointerEnter={() => {
        pointerInside.current = true
        expandRail()
      }}
      onPointerLeave={() => {
        pointerInside.current = false
        collapseWithoutInteraction()
      }}
      onFocusCapture={expandRail}
      onBlurCapture={(event) => {
        if (!pointerInside.current && !event.currentTarget.contains(event.relatedTarget)) {
          collapseRail()
        }
      }}
      className={cn(
        'hidden shrink-0 flex-col gap-3 overflow-y-auto bg-panel px-2 py-3 @rail:flex',
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
