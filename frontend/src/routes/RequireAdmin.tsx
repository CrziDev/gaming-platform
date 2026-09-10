import { Navigate, Outlet } from 'react-router'

import { useSession } from '@/features/auth'
import { adminPaths } from '@/routes/paths'

export function RequireAdmin() {
  const { data: user } = useSession()

  if (!user || user.role !== 'admin') {
    return <Navigate to={adminPaths.login} replace />
  }

  return <Outlet />
}
