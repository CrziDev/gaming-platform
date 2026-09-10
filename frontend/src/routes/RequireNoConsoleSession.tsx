import { Navigate, Outlet } from 'react-router'

import { useSession } from '@/features/auth'
import { adminPaths } from '@/routes/paths'

export function RequireNoConsoleSession() {
  const { data: user } = useSession()

  if (user?.role === 'admin') {
    return <Navigate to={adminPaths.dashboard} replace />
  }

  return <Outlet />
}
