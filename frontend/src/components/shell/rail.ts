import type { RailChoice } from './ShellContext'

export type RailMode = RailChoice | 'auto'

export function railMode(rail: RailChoice | null): RailMode {
  return rail ?? 'auto'
}

export const railWidth: Record<RailMode, string> = {
  expanded: 'w-48',
  collapsed: 'w-14',
  auto: 'w-14 @rail-wide:w-48',
}

export const railRow: Record<RailMode, string> = {
  expanded: 'justify-start',
  collapsed: 'justify-center',
  auto: 'justify-center @rail-wide:justify-start',
}

export const railLabel: Record<RailMode, string> = {
  expanded: '',
  collapsed: 'sr-only',
  auto: 'sr-only @rail-wide:not-sr-only',
}
