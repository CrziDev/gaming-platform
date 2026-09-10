const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })
const dayMonth = new Intl.DateTimeFormat('en-PH', { day: '2-digit', month: 'short' })
const clock = new Intl.DateTimeFormat('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false })
const clockSeconds = new Intl.DateTimeFormat('en-PH', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

export function formatDate(iso: string): string {
  return dateOnly.format(new Date(iso))
}

export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(iso))
}

export function formatClock(iso: string): string {
  return clock.format(new Date(iso))
}

export function formatClockSeconds(iso: string): string {
  return clockSeconds.format(new Date(iso))
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 1000],
  ['minute', 60_000],
  ['hour', 3_600_000],
  ['day', 86_400_000],
]

export function formatRelative(iso: string, now: number = Date.now()): string {
  const elapsed = new Date(iso).getTime() - now
  const magnitude = Math.abs(elapsed)

  if (magnitude >= 7 * 86_400_000) {
    return dayMonth.format(new Date(iso))
  }

  let chosen: Intl.RelativeTimeFormatUnit = 'second'
  let size = 1000
  for (const [unit, ms] of units) {
    if (magnitude >= ms) {
      chosen = unit
      size = ms
    }
  }
  return relative.format(Math.round(elapsed / size), chosen)
}

export function formatDuration(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-PH').format(value)
}

export function formatPercent(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100)
  const fraction = Math.abs(basisPoints % 100)
    .toString()
    .padStart(2, '0')
  return `${whole}.${fraction}%`
}

export function formatMultiplier(hundredths: number): string {
  const whole = Math.trunc(hundredths / 100)
  const fraction = Math.abs(hundredths % 100)
    .toString()
    .padStart(2, '0')
  return `${whole}.${fraction}×`
}
