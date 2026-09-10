import { BrowserRouter } from 'react-router'

import { Providers, RouterProviders } from '@/app/Providers'
import { SessionExpiredDialog } from '@/app/SessionExpiredDialog'
import { SessionGate } from '@/app/SessionGate'
import { AppRoutes } from '@/routes/AppRoutes'

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <RouterProviders>
          <SessionGate>
            <AppRoutes />
            <SessionExpiredDialog />
          </SessionGate>
        </RouterProviders>
      </BrowserRouter>
    </Providers>
  )
}
