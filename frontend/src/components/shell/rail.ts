import type { RailChoice } from './ShellContext'

export type RailMode = RailChoice | 'auto'

export function railMode(rail: RailChoice): RailMode {
  return rail
}

export const railWidth: Record<RailMode, string> = {
  expanded: 'w-48',
  collapsed: 'w-14',
  auto: 'w-14 @rail-wide:w-48',
}

export const railRow: Record<RailMode, string> = {
  expanded: 'justify-start',
  collapsed: 'justify-start',
  auto: 'justify-start',
}

export const railLabel: Record<RailMode, string> = {
  expanded: 'max-w-36 translate-x-0 opacity-100',
  collapsed: 'max-w-0 -translate-x-1 opacity-0',
  auto: 'max-w-0 -translate-x-1 opacity-0 @rail-wide:max-w-36 @rail-wide:translate-x-0 @rail-wide:opacity-100',
}

export const railWide: Record<RailMode, string> = {
  expanded: 'translate-x-0 opacity-100',
  collapsed: 'pointer-events-none translate-x-1 opacity-0',
  auto: 'pointer-events-none translate-x-1 opacity-0 @rail-wide:pointer-events-auto @rail-wide:translate-x-0 @rail-wide:opacity-100',
}

export const railNarrow: Record<RailMode, string> = {
  expanded: 'pointer-events-none -translate-x-1 opacity-0',
  collapsed: 'translate-x-0 opacity-100',
  auto: 'translate-x-0 opacity-100 @rail-wide:pointer-events-none @rail-wide:-translate-x-1 @rail-wide:opacity-0',
}
