import { formatPercent } from '@/lib/format'

// A profile at or above 100% is a negative-margin configuration and reads in
// danger wherever a rate is shown.
export function ActiveRtp({ basisPoints, size = 'sm' }: { basisPoints: number | null; size?: 'sm' | 'lg' }) {
  if (basisPoints === null) {
    return <span className="text-[12.5px] text-ink-mute">—</span>
  }
  return (
    <span
      className={[
        'font-mono font-medium tnum',
        size === 'lg' ? 'text-lg' : 'text-sm',
        basisPoints >= 10_000 ? 'text-danger' : '',
      ].join(' ')}
    >
      {formatPercent(basisPoints)}
    </span>
  )
}
