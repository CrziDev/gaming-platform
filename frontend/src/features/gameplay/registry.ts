import type { ComponentType } from 'react'

import { DEFAULT_PLINKO_PARAMS, type PlinkoParams, type PlinkoTable } from './multipliers'
import { PlinkoControls, type GameControlsProps } from './PlinkoControls'

// Everything the host needs to run one integrated title. Typed to Plinko's
// parameters while it is the only game; a second engine widens this to a union.
export type GameModule = {
  slug: 'plinko'
  frameUrl: string
  aspect: 'portrait' | 'landscape'
  defaultParams: PlinkoParams
  Controls: ComponentType<GameControlsProps<PlinkoParams>>
  // Reads one board out of the manifest's table; the table itself is the server's.
  multipliers: (table: PlinkoTable, params: PlinkoParams) => readonly number[]
}

const plinko: GameModule = {
  slug: 'plinko',
  frameUrl: '/games/plinko/index.html',
  aspect: 'portrait',
  defaultParams: DEFAULT_PLINKO_PARAMS,
  Controls: PlinkoControls,
  multipliers: (table, params) => table[params.rows][params.risk],
}

const gameModules: Readonly<Record<string, GameModule>> = { plinko }

export function gameModuleFor(slug: string): GameModule | null {
  return gameModules[slug] ?? null
}
