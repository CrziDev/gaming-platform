import type { ComponentType } from 'react'

import { DEFAULT_PLINKO_PARAMS, summarizePlinko, type PlinkoBoard, type PlinkoParams } from './multipliers'
import { RiskMenu, type GameControlsProps } from './RiskMenu'
import { TropicalTitleMark, type TitleMarkProps } from './TropicalTitleMark'

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
  // Pixels the title row stands over the stage's empty top corners.
  titleOverlap: number
  defaultParams: PlinkoParams
  Controls: ComponentType<GameControlsProps<PlinkoParams>>
  summarizeParams: (params: PlinkoParams) => string
  // Reads one risk's payouts out of the manifest's board; the board itself is the server's.
  multipliers: (board: PlinkoBoard, params: PlinkoParams) => readonly number[]
  // Dresses the host's controls in the scene's materials, from styles/games/<slug>.css.
  skin: boolean
  // Sets the title row's name as the game's own logo, styled in styles/games/<slug>.css.
  TitleMark: ComponentType<TitleMarkProps> | null
}

type PlinkoTitleOptions = Partial<Pick<GameModule, 'stageAspect' | 'stageGutter' | 'titleOverlap' | 'skin' | 'TitleMark'>>

// Every Plinko title plays the same engine and board; only its frame, its stage, and
// what it declares over the host's controls differ.
function plinkoTitle(slug: string, options: PlinkoTitleOptions = {}): GameModule {
  return {
    slug,
    frameUrl: `/games/${slug}/index.html`,
    subtitle: 'RISK · PLAY · WIN',
    stageAspect: 10 / 11.2,
    stageGutter: 44,
    titleOverlap: 0,
    defaultParams: DEFAULT_PLINKO_PARAMS,
    Controls: RiskMenu,
    summarizeParams: summarizePlinko,
    multipliers: (board, params) => board[params.risk],
    skin: false,
    TitleMark: null,
    ...options,
  }
}

const gameModules: Readonly<Record<string, GameModule>> = {
  plinko: plinkoTitle('plinko'),
  'plinko-billiards': plinkoTitle('plinko-billiards', { skin: true }),
  'plinko-tropical': plinkoTitle('plinko-tropical', {
    stageAspect: 0.98,
    stageGutter: 12,
    titleOverlap: 30,
    TitleMark: TropicalTitleMark,
  }),
}

export function gameModuleFor(slug: string): GameModule | null {
  return gameModules[slug] ?? null
}
