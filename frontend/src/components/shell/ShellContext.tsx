import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import { useRemembered } from '@/lib/remembered'

export type RailChoice = 'expanded' | 'collapsed'

type ShellValue = {
  rail: RailChoice
  toggleRail: () => void
  expandRail: () => void
  collapseRail: () => void
  chatOpen: boolean
  setChatOpen: (open: boolean) => void
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  search: string
  setSearch: (term: string) => void
  searchFocus: number
  focusSearch: () => void
  searchFocused: () => void
}

const ShellContext = createContext<ShellValue | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const [rail, setRail] = useState<RailChoice>('collapsed')
  const [chatOpen, setChatOpen] = useRemembered('shell.chat-open', true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchFocus, setSearchFocus] = useState(0)

  const toggleRail = useCallback(() => {
    setRail((current) => (current === 'expanded' ? 'collapsed' : 'expanded'))
  }, [])

  const expandRail = useCallback(() => setRail('expanded'), [])
  const collapseRail = useCallback(() => setRail('collapsed'), [])

  const focusSearch = useCallback(() => {
    if (railVisible()) {
      expandRail()
    } else {
      setDrawerOpen(true)
    }
    setSearchFocus((count) => count + 1)
  }, [expandRail])

  const searchFocused = useCallback(() => setSearchFocus(0), [])

  const value = useMemo(
    () => ({
      rail,
      toggleRail,
      expandRail,
      collapseRail,
      chatOpen,
      setChatOpen,
      drawerOpen,
      setDrawerOpen,
      search,
      setSearch,
      searchFocus,
      focusSearch,
      searchFocused,
    }),
    [
      rail,
      toggleRail,
      expandRail,
      collapseRail,
      chatOpen,
      setChatOpen,
      drawerOpen,
      search,
      searchFocus,
      focusSearch,
      searchFocused,
    ],
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

export function railVisible(): boolean {
  return window.matchMedia('(min-width: 760px)').matches
}
