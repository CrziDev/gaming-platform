import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import { useRemembered } from '@/lib/remembered'

type ShellValue = {
  railCollapsed: boolean
  toggleRail: () => void
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
}

const ShellContext = createContext<ShellValue | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const [railCollapsed, setRailCollapsed] = useRemembered('shell.rail-collapsed', false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const toggleRail = useCallback(
    () => setRailCollapsed(!railCollapsed),
    [railCollapsed, setRailCollapsed],
  )

  const value = useMemo(
    () => ({ railCollapsed, toggleRail, drawerOpen, setDrawerOpen, searchOpen, setSearchOpen }),
    [railCollapsed, toggleRail, drawerOpen, searchOpen],
  )

  return <ShellContext value={value}>{children}</ShellContext>
}

export function useShell(): ShellValue {
  const context = use(ShellContext)
  if (!context) {
    throw new Error('useShell must be used inside ShellProvider')
  }
  return context
}
