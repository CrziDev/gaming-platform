import type { ComponentType } from 'react'

import { DEFAULT_PLINKO_PARAMS, summarizePlinko, type PlinkoBoard, type PlinkoParams } from './multipliers'
import { RiskMenu, type GameControlsProps } from './RiskMenu'

// Everything the host needs to run one integrated title. Typed to Plinko's
// parameters while its engine is the only one; a second engine widens this to a union.
export type GameModule = {
  slug: string
  frameUrl: string
  subtitle: string
  // Width over height of the board the frame draws inside the host's stage.
  stageAspect: number
  // Pixels kept clear beside the board on a narrow screen, where the frame's taglines stand.
  stageGutter: number
  defaultParams: PlinkoParams
  Controls: ComponentType<GameControlsProps<PlinkoParams>>
  summarizeParams: (params: PlinkoParams) => string
  // Reads one risk's payouts out of the manifest's board; the board itself is the server's.
  multipliers: (board: PlinkoBoard, params: PlinkoParams) => readonly number[]
  // Dresses the host's controls in the scene's materials, from styles/games/<slug>.css.
  skin: boolean
}

// Every Plinko title plays the same engine and board; only its frame and skin differ.
function plinkoTitle(slug: string, { skin = false } = {}): GameModule {
  return {
    slug,
    frameUrl: `/games/${slug}/index.html`,
    subtitle: 'RISK · PLAY · WIN',
    stageAspect: 10 / 11.2,
    stageGutter: 44,
    defaultParams: DEFAULT_PLINKO_PARAMS,
    Controls: RiskMenu,
    summarizeParams: summarizePlinko,
    multipliers: (board, params) => board[params.risk],
    skin,
  }
}

const gameModules: Readonly<Record<string, GameModule>> = {
  plinko: plinkoTitle('plinko'),
  'plinko-billiards': plinkoTitle('plinko-billiards', { skin: true }),
}

export function gameModuleFor(slug: string): GameModule | null {
  return gameModules[slug] ?? null
}
