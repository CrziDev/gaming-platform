import { useSyncExternalStore } from 'react'

type Listener = () => void

const listeners = new Set<Listener>()
let expired = false
let hadSession = false

function publish() {
  for (const listener of listeners) {
    listener()
  }
}

export function noteSession(user: unknown) {
  if (user) {
    hadSession = true
    return
  }
  if (user === null && hadSession) {
    reportSessionExpired()
  }
}

export function reportSessionExpired() {
  hadSession = false
  if (expired) {
    return
  }
  expired = true
  publish()
}

export function clearSessionExpired() {
  hadSession = false
  if (!expired) {
    return
  }
  expired = false
  publish()
}

export function useSessionExpired(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => expired,
    () => false,
  )
}
