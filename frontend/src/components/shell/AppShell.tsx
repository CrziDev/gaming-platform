import { Outlet } from 'react-router'

import { AuthModal } from '@/features/auth'

import { BottomNav } from './BottomNav'
import { ChatRail } from './ChatRail'
import { Header } from './Header'
import { MobileDrawer } from './MobileDrawer'
import { SearchSheet } from './SearchSheet'
import { ShellProvider } from './ShellContext'
import { Sidebar } from './Sidebar'

export function AppShell() {
  return (
    <ShellProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-base">
        <Header />

        <div className="@container flex min-h-0 flex-1">
          <Sidebar />
          <main className="@container min-w-0 flex-1 overflow-y-auto px-3.5 pt-3.5 pb-8">
            <div className="mx-auto w-full max-w-[1320px]">
              <Outlet />
            </div>
          </main>
          <ChatRail />
        </div>

        <BottomNav />
      </div>

      <MobileDrawer />
      <SearchSheet />
      <AuthModal />
    </ShellProvider>
  )
}
