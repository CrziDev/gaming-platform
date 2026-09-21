import { useEffect, useState } from 'react'

export const MOBILE_GAME_QUERY = '(max-width: 759px)'

// Keep responsive rendering semantic as well as visual: only the controls for
// the active layout are mounted, so assistive technology never sees duplicates.
export function useMediaQuery(query: string, fallback = false): boolean {
  const read = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback)
  const [matches, setMatches] = useState(read)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const media = window.matchMedia(query)
    const sync = () => setMatches(media.matches)
    sync()
    media.addEventListener?.('change', sync)
    return () => media.removeEventListener?.('change', sync)
  }, [query])

  return matches
}
