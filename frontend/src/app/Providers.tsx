import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { ToastProvider } from '@/components/ui/Toast'
import { AuthIntentProvider } from '@/features/auth'
import { createQueryClient } from '@/app/queryClient'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

export function RouterProviders({ children }: { children: ReactNode }) {
  return <AuthIntentProvider>{children}</AuthIntentProvider>
}
