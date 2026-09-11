import { useCallback, useState } from 'react'

export function useRemembered(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => {
    const stored = read(key)
    return stored === null ? fallback : stored === 'true'
  })

  const remember = useCallback(
    (next: boolean) => {
      setValue(next)
      write(key, next ? 'true' : 'false')
    },
    [key],
  )

  return [value, remember]
}

export function useRememberedChoice<T extends string>(
  key: string,
  choices: readonly T[],
): [T | null, (next: T | null) => void] {
  const [value, setValue] = useState<T | null>(() => {
    const stored = read(key)
    return choices.find((choice) => choice === stored) ?? null
  })

  const remember = useCallback(
    (next: T | null) => {
      setValue(next)
      write(key, next)
    },
    [key],
  )

  return [value, remember]
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, value)
  } catch {
    // A browser with site data blocked keeps the choice for this page view only.
  }
}
