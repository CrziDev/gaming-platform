import { useCallback, useState } from 'react'

export function useRemembered(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => read(key) ?? fallback)

  const remember = useCallback(
    (next: boolean) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, next ? 'true' : 'false')
      } catch {
        // A browser with site data blocked keeps the choice for this page view only.
      }
    },
    [key],
  )

  return [value, remember]
}

function read(key: string): boolean | null {
  try {
    const stored = window.localStorage.getItem(key)
    return stored === null ? null : stored === 'true'
  } catch {
    return null
  }
}
