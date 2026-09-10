import { useEffect } from 'react'

import { useAuthIntent, useSession } from '@/features/auth'
import { LobbyPage } from '@/pages/LobbyPage'
import { paths } from '@/routes/paths'

import type { AuthTab } from '@/features/auth/intent'

export function AuthDeepLink({ tab }: { tab: AuthTab }) {
  const { data: user } = useSession()
  const { open } = useAuthIntent()

  useEffect(() => {
    if (!user) {
      open({ tab, redirectTo: paths.lobby })
    }
  }, [user, tab, open])

  return <LobbyPage />
}
