import { Globe, LifeBuoy } from 'lucide-react'

import { cn } from '@/lib/cn'

import { FutureDevelopmentRow } from './FutureDevelopmentRow'
import { NavList } from './NavList'
import { playerNav } from './nav'
import { railMode, railWidth } from './rail'
import { RailSearch } from './RailSearch'
import { useShell } from './ShellContext'

export function Sidebar() {
  const { rail } = useShell()
  const mode = railMode(rail)

  return (
    <aside
      aria-label="Main navigation"
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
