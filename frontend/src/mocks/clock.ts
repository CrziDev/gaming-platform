const origin = Date.now()

export function minutesAgo(minutes: number): string {
  return new Date(origin - minutes * 60_000).toISOString()
}

export function hoursAgo(hours: number): string {
  return minutesAgo(hours * 60)
}

export function daysAgo(days: number): string {
  return minutesAgo(days * 24 * 60)
}

export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

export function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)] as T
}

