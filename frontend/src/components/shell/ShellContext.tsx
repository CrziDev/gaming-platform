import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import { useRemembered, useRememberedChoice } from '@/lib/remembered'

export type RailChoice = 'expanded' | 'collapsed'

const railChoices = ['expanded', 'collapsed'] as const

type ShellValue = {
  rail: RailChoice | null
  toggleRail: () => void
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
  const [rail, setRail] = useRememberedChoice('shell.rail', railChoices)
  const [chatOpen, setChatOpen] = useRemembered('shell.chat-open', true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchFocus, setSearchFocus] = useState(0)

  const toggleRail = useCallback(() => {
    const expanded = rail === null ? railWideByDefault() : rail === 'expanded'
    setRail(expanded ? 'collapsed' : 'expanded')
  }, [rail, setRail])

  const focusSearch = useCallback(() => {
    if (railVisible()) {
      setRail('expanded')
    } else {
      setDrawerOpen(true)
    }
    setSearchFocus((count) => count + 1)
  }, [setRail])

  const searchFocused = useCallback(() => setSearchFocus(0), [])

  const value = useMemo(
    () => ({
      rail,
      toggleRail,
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
    [rail, toggleRail, chatOpen, setChatOpen, drawerOpen, search, searchFocus, focusSearch, searchFocused],
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

function railWideByDefault(): boolean {
  return window.matchMedia('(min-width: 900px)').matches
}
