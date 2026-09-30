export type WagerLimits = { min: number; max: number; step: number }

// The server accepts a stake of min + n × step inside [min, max]. The stepper walks a
// 1-2-5 ladder of such stakes, so a few taps cross the whole range; the limits
// themselves are always rungs.
export function stakeLadder({ min, max, step }: WagerLimits): number[] {
  if (!(min > 0 && max >= min && step > 0)) return [min]
  const rungs = new Set([min, max])
  for (let decade = 1; decade <= max; decade *= 10) {
    for (const factor of [1, 2, 5]) {
      const stake = factor * decade
      if (stake > min && stake < max && (stake - min) % step === 0) rungs.add(stake)
    }
  }
  return [...rungs].sort((a, b) => a - b)
}

// The next rung above or below a stake. A stake between rungs moves to the nearer
// rung in that direction; at either end it stays put.
export function stepStake(ladder: readonly number[], stake: number, direction: 1 | -1): number {
  if (direction === 1) return ladder.find((rung) => rung > stake) ?? ladder[ladder.length - 1] ?? stake
  const lower = ladder.filter((rung) => rung < stake)
  return lower[lower.length - 1] ?? ladder[0] ?? stake
}
