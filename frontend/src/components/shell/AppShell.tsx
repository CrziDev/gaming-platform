import { Outlet } from 'react-router'

import { AuthModal } from '@/features/auth'

import { BottomNav } from './BottomNav'
import { Header } from './Header'
import { MobileDrawer } from './MobileDrawer'
import { SearchSheet } from './SearchSheet'
import { ShellProvider } from './ShellContext'
import { Sidebar } from './Sidebar'

export function AppShell() {
  return (
    <ShellProvider>
      <div className="min-h-dvh">
        <Header />

        <div className="flex">
          <Sidebar />
          <main className="min-w-0 flex-1 pb-24 lg:pb-0">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
              <Outlet />
            </div>
          </main>
        </div>

        <BottomNav />
        <MobileDrawer />
        <SearchSheet />
        <AuthModal />
      </div>
    </ShellProvider>
  )
}
