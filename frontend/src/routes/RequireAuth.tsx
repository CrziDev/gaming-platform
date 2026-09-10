import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { useAuthIntent, useSession } from '@/features/auth'
import { paths, safeRedirect } from '@/routes/paths'

export function RequireAuth() {
  const location = useLocation()
  const { data: user } = useSession()
  const { open } = useAuthIntent()

  const target = safeRedirect({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  })

  useEffect(() => {
    if (!user) {
      open({ tab: 'signin', ...(target ? { redirectTo: target } : {}) })
    }
  }, [user, target, open])

  if (!user) {
    return <Navigate to={paths.lobby} replace />
  }

  return <Outlet />
}
