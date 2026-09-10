import { useSyncExternalStore } from 'react'

import type { Currency } from '@/lib/money'

const STORAGE_KEY = 'gp.active-currency'
const FALLBACK: Currency = 'PHP'

const listeners = new Set<() => void>()
let current: Currency = read()

function read(): Currency {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'PHP' || stored === 'USD') return stored
  } catch {
    // Private windows and blocked site data both throw. A remembered currency is a
    // convenience, not state the platform depends on.
  }
  return FALLBACK
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setActiveCurrency(currency: Currency): void {
  if (currency === current) return
  current = currency
  try {
    window.localStorage.setItem(STORAGE_KEY, currency)
  } catch {
    // Nothing to recover: the choice still holds for this page.
  }
  listeners.forEach((listener) => listener())
}

export function useActiveCurrency(): Currency {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => FALLBACK,
  )
}
