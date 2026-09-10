import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

export type AuthTab = 'signin' | 'join'

export type AuthIntent = {
  tab: AuthTab
  redirectTo?: string
  context?: string
}

type AuthIntentValue = {
  intent: AuthIntent | null
  open: (intent: AuthIntent) => void
  close: () => void
  setTab: (tab: AuthTab) => void
}

const AuthIntentContext = createContext<AuthIntentValue | null>(null)

export function AuthIntentProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<AuthIntent | null>(null)

  const open = useCallback((next: AuthIntent) => setIntent(next), [])
  const close = useCallback(() => setIntent(null), [])
  const setTab = useCallback(
    (tab: AuthTab) => setIntent((current) => (current ? { ...current, tab } : { tab })),
    [],
  )

  const value = useMemo(() => ({ intent, open, close, setTab }), [intent, open, close, setTab])

  return <AuthIntentContext value={value}>{children}</AuthIntentContext>
}

export function useAuthIntent(): AuthIntentValue {
  const context = use(AuthIntentContext)
  if (!context) {
    throw new Error('useAuthIntent must be used inside AuthIntentProvider')
  }
  return context
}
