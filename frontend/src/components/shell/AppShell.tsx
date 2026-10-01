import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useMatch } from 'react-router'

import { AuthModal } from '@/features/auth'
import { cn } from '@/lib/cn'
import { MOBILE_GAME_QUERY, useMediaQuery } from '@/lib/media'

import { AnnouncementTicker } from './AnnouncementTicker'
import { BottomNav } from './BottomNav'
import { ChatRail } from './ChatRail'
import { Header } from './Header'
import { MobileDrawer } from './MobileDrawer'
import { useSearchShortcut } from './searchShortcut'
import { ShellProvider } from './ShellContext'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const gameRoute = Boolean(useMatch('/game/:slug'))
  const location = useLocation()
  const narrowViewport = useMediaQuery(MOBILE_GAME_QUERY)
  // A game fills the content area edge to edge; on a phone it also takes the bottom
  // nav's place, with navigation still a tap away in the drawer.
  const mobileGame = gameRoute && narrowViewport
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0
    }
  }, [location.pathname])

  return (
    <ShellProvider>
      <SearchShortcut />
      <div className="flex h-full flex-col overflow-hidden bg-base">
        <Header />

        <div className="@container flex min-h-0 flex-1">
          <Sidebar />
          <div className="shell-content-column relative flex min-h-0 min-w-0 flex-1 flex-col">
            {location.pathname === '/' ? <AnnouncementTicker /> : null}
            <main
              ref={mainRef}
              className={cn(
                'shell-main @container min-h-0 min-w-0 flex-1 overflow-y-auto',
                gameRoute ? 'p-0' : 'px-3.5 pt-3.5 pb-8',
              )}
            >
              <div className={cn('mx-auto w-full', gameRoute ? 'max-w-none' : 'max-w-[1320px]')}>
                <Outlet />
              </div>
            </main>
          </div>
          <ChatRail />
        </div>

        {mobileGame ? null : <BottomNav />}
      </div>

      <MobileDrawer />
      <AuthModal />
    </ShellProvider>
  )
}

function SearchShortcut() {
  useSearchShortcut()
  return null
}
