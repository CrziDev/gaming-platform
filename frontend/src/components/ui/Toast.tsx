import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type ToastTone = 'info' | 'success' | 'danger'

type Toast = {
  id: number
  message: string
  tone: ToastTone
}

type ToastContextValue = {
  push: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const tones: Record<ToastTone, string> = {
  info: 'border-line-strong bg-surface-2 text-ink',
  success: 'border-success/35 bg-success/12 text-ink',
  danger: 'border-danger/35 bg-danger/12 text-ink',
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId++
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4000)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-60 flex flex-col items-center gap-2 px-4 sm:bottom-8"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-card border px-4 py-3 text-sm shadow-e2',
              tones[toast.tone],
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext>
  )
}

export function useToast(): ToastContextValue {
  const context = use(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider')
  }
  return context
}
