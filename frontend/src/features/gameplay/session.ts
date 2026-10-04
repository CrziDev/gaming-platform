import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react'

import { ApiError } from '@/api/client'
import type { Wallet } from '@/api/types'
import type { GameFrameStatus, GameLayout } from '@/components/game/GameHost'
import { useToast } from '@/components/ui/Toast'
import { walletQueryKey } from '@/features/wallet'
import { formatMoney, money, type Currency } from '@/lib/money'
import { useRememberedChoice } from '@/lib/remembered'
import { createUUID } from '@/lib/uuid'

import { createGameBridge, frameOriginOf, type GameBridge } from './bridge'
import { gameManifestQueryKey, useGameManifest, useGameSound, usePlayRound } from './hooks'
import { PLINKO_BOARD_ROWS, PLINKO_RISKS, type PlinkoBoard, type PlinkoParams, type PlinkoRisk } from './multipliers'
import type { GameModule } from './registry'
import { PROTOCOL_VERSION, type FrameMessage, type PlinkoBoards } from './schemas'

const READY_TIMEOUT_MS = 30_000
const SETTLE_FALLBACK_MS = 8_000
const NOT_ON_THIS_SERVER = "This game isn't available right now."

// The board's rect inside the game frame, and the rects the platform's controls cover,
// in CSS pixels.
export type GameStage = GameLayout

export type GameSession = {
  attachFrame: Ref<HTMLIFrameElement | null>
  frame: { status: GameFrameStatus; key: number; error?: string | undefined; retry: () => void }
  setStage: (stage: GameStage) => void
  // The played board's payouts, from the manifest.
  board: PlinkoBoard | null
  params: PlinkoParams
  setParams: (params: PlinkoParams) => void
  canChangeParams: boolean
  inFlight: number
  // False until the server's manifest has configured the board; a bet is never
  // offered against a table the player cannot see.
  canPlay: boolean
  play: (stakeMinor: number) => Promise<void>
  // True from the synchronously admitted click until its request fails or its
  // ball settles; Plinko never offers a second round while this is true.
  playing: boolean
  sound: boolean
  setSound: (enabled: boolean) => void
}

type GameSessionOptions = {
  module: GameModule | null
  slug: string
  currency: Currency
  onShortfall: () => void
}

type Board = { risk: PlinkoRisk; multipliers: readonly number[] }
type PendingRound = { timer: number; wallet: Wallet }

function sameBoard(a: Board, b: Board): boolean {
  return (
    a.risk === b.risk &&
    a.multipliers.length === b.multipliers.length &&
    a.multipliers.every((value, index) => value === b.multipliers[index])
  )
}

function manifestFailure(error: Error): string {
  if (error instanceof ApiError && error.status === 404) return NOT_ON_THIS_SERVER
  return error.message
}

// Runs one game page: the frame's lifecycle, the bridge, and every round from
// request to landing. The board is configured from the server's manifest and the
// server settles a round before the ball is dropped; this hook only decides when
// the settled truth is refetched, which is when the ball lands or, failing that,
// a few seconds later.
export function useGameSession({ module, slug, currency, onShortfall }: GameSessionOptions): GameSession {
  const queryClient = useQueryClient()
  const toast = useToast()
  const mutation = usePlayRound()
  const [sound, setSound] = useGameSound()
  const manifest = useGameManifest(slug, module !== null)
  // An error after data removes the table too: the server no longer offers
  // what the board shows.
  const boards: PlinkoBoards | null = manifest.isError ? null : (manifest.data ?? null)
  const board = boards?.board ?? null

  // A callback ref, so the bridge is built when the iframe actually mounts —
  // which is after the game loads, and again after every retry.
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const attachFrame = useCallback((node: HTMLIFrameElement | null) => setIframe(node), [])
  const bridgeRef = useRef<GameBridge | null>(null)
  const pendingRef = useRef(new Map<string, PendingRound>())
  // State drives the controls; the ref closes the same-render window in which
  // several clicks could otherwise start several mutations before React paints.
  const playLockedRef = useRef(false)
  const sentRef = useRef<Board | null>(null)
  const stageRef = useRef<GameStage | null>(null)

  const [status, setStatus] = useState<GameFrameStatus>('loading')
  const [frameKey, setFrameKey] = useState(0)
  const [frameError, setFrameError] = useState<string>()
  const [inFlight, setInFlight] = useState(0)
  const [playLocked, setPlayLocked] = useState(false)

  const [rememberedRisk, rememberRisk] = useRememberedChoice(`game.${slug}.risk`, PLINKO_RISKS)
  const params: PlinkoParams = {
    rows: PLINKO_BOARD_ROWS,
    risk: rememberedRisk ?? module?.defaultParams.risk ?? 'normal',
  }

  // Handlers read the latest values through this ref. It is synced in a layout
  // effect so a click that follows a render can never see the previous frame state.
  const latest = useRef({ params, sound, status, module, boards })
  useLayoutEffect(() => {
    latest.current = { params, sound, status, module, boards }
  })

  const unlockPlay = useCallback(() => {
    playLockedRef.current = false
    setPlayLocked(false)
  }, [])

  const settle = useCallback(
    (roundId: string) => {
      const pending = pendingRef.current
      const round = pending.get(roundId)
      if (round === undefined) return
      window.clearTimeout(round.timer)
      pending.delete(roundId)
      // Reveal the same authoritative wallet that committed with the round
      // before another wager can be offered. The refetch catches any external
      // wallet movement that happened while the ball was falling.
      queryClient.setQueryData([...walletQueryKey, round.wallet.currency], round.wallet)
      setInFlight(pending.size)
      if (pending.size === 0) unlockPlay()
      void queryClient.invalidateQueries({ queryKey: walletQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['rounds'] })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    [queryClient, unlockPlay],
  )

  const settleAll = useCallback(() => {
    for (const roundId of Array.from(pendingRef.current.keys())) settle(roundId)
  }, [settle])

  // Sends the board the frame does not already have. Nothing is sent without a
  // manifest, and a new table waits while a ball is falling: the pending map is
  // read directly so a ready that follows settleAll sees it already empty.
  const configure = useCallback(() => {
    const { params: current, sound: enabled, module: active, boards: served } = latest.current
    if (!active || !served || pendingRef.current.size > 0) return
    const next: Board = { risk: current.risk, multipliers: active.multipliers(served.board, current) }
    if (sentRef.current && sameBoard(sentRef.current, next)) return
    const delivered =
      bridgeRef.current?.send({
        v: PROTOCOL_VERSION,
        type: 'configure',
        rows: PLINKO_BOARD_ROWS,
        risk: next.risk,
        multipliers_hundredths: [...next.multipliers],
        sound: enabled,
      }) ?? false
    if (delivered) sentRef.current = next
  }, [])

  const sendLayout = useCallback(() => {
    const stage = stageRef.current
    if (stage) bridgeRef.current?.send({ v: PROTOCOL_VERSION, type: 'layout', ...stage })
  }, [])

  // The host measures where the board sits over the frame; before the frame is ready
  // the rect is kept and sent with the first configure.
  const setStage = useCallback(
    (stage: GameStage) => {
      stageRef.current = stage
      if (latest.current.status === 'ready') sendLayout()
    },
    [sendLayout],
  )

  useEffect(() => {
    if (!module || !iframe) return

    const onMessage = (message: FrameMessage) => {
      switch (message.type) {
        case 'ready':
          // A second ready is a reloaded frame: whatever was falling is gone, and
          // every round it carried was settled before it was dropped.
          settleAll()
          sentRef.current = null
          setStatus('ready')
          setFrameError(undefined)
          configure()
          sendLayout()
          break
        case 'landed':
          settle(message.round_id)
          break
        case 'error':
          if (message.code === 'unsupported_version') {
            setStatus('error')
            setFrameError("This game can't be played right now.")
          } else {
            toast.push('The game hit a problem. Your bets and results are unaffected.', 'danger')
          }
          break
      }
    }

    const bridge = createGameBridge({ iframe, origin: frameOriginOf(module.frameUrl), onMessage })
    bridgeRef.current = bridge
    const timer = window.setTimeout(() => {
      setStatus((current) => (current === 'loading' ? 'error' : current))
    }, READY_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timer)
      bridge.dispose()
      bridgeRef.current = null
    }
  }, [module, iframe, configure, sendLayout, settle, settleAll, toast])

  useEffect(() => {
    const pending = pendingRef.current
    return () => {
      for (const round of pending.values()) window.clearTimeout(round.timer)
      pending.clear()
    }
  }, [])

  useEffect(() => {
    if (status === 'ready') configure()
  }, [status, params.risk, board, inFlight, configure])

  useEffect(() => {
    if (status === 'ready') bridgeRef.current?.send({ v: PROTOCOL_VERSION, type: 'set_sound', enabled: sound })
  }, [status, sound])

  const play = useCallback(
    async (stakeMinor: number) => {
      const { status: frameStatus, module: active, params: current, boards: served } = latest.current
      if (!active || !served || playLockedRef.current) return

      playLockedRef.current = true
      setPlayLocked(true)

      try {
        const response = await mutation.mutateAsync({
          slug,
          stake_minor: stakeMinor,
          currency,
          params: current,
          idempotencyKey: createUUID(),
        })

        // A round settled at another return means the table on screen is stale.
        // The refetched manifest reconfigures the board once every ball has landed;
        // this ball still drops, because its drop carries its own settled result.
        if (response.round.rtp_basis_points !== served.rtp_basis_points) {
          void queryClient.invalidateQueries({ queryKey: gameManifestQueryKey(slug) })
        }

        const roundId = response.round.id
        const slot = response.result.slot
        const multiplier = response.round.multiplier_hundredths
        const label = formatMoney(money(response.round.win_minor ?? 0, currency), { sign: 'always' })

        pendingRef.current.set(roundId, {
          timer: window.setTimeout(() => settle(roundId), SETTLE_FALLBACK_MS),
          wallet: response.wallet,
        })
        setInFlight(pendingRef.current.size)

        const dropped =
          frameStatus === 'ready' &&
          typeof slot === 'number' &&
          multiplier !== null &&
          (bridgeRef.current?.send({
            v: PROTOCOL_VERSION,
            type: 'drop',
            round_id: roundId,
            slot,
            multiplier_hundredths: multiplier,
            result_label: label,
          }) ??
            false)

        if (!dropped) {
          settle(roundId)
          toast.push(`Round result: ${label}`)
        }
      } catch (error) {
        unlockPlay()
        if (error instanceof ApiError && error.code === 'INSUFFICIENT_BALANCE') {
          void queryClient.invalidateQueries({ queryKey: walletQueryKey })
          onShortfall()
          return
        }
        if (error instanceof ApiError && error.status === 404) {
          toast.push(NOT_ON_THIS_SERVER, 'danger')
          return
        }
        toast.push(error instanceof Error ? error.message : 'Your bet could not be placed.', 'danger')
      }
    },
    [currency, mutation, onShortfall, queryClient, settle, slug, toast, unlockPlay],
  )

  const setParams = useCallback((next: PlinkoParams) => rememberRisk(next.risk), [rememberRisk])

  const { isError: manifestFailed, refetch: refetchManifest } = manifest
  const retry = useCallback(() => {
    settleAll()
    setStatus('loading')
    setFrameError(undefined)
    setFrameKey((key) => key + 1)
    if (manifestFailed) void refetchManifest()
  }, [settleAll, manifestFailed, refetchManifest])

  // The frame is only as ready as its manifest: a manifest failure is the error
  // state whatever the frame said, and a frame that is ready waits as loading
  // until the manifest has configured it.
  const frame: GameSession['frame'] = manifest.isError
    ? { status: 'error', key: frameKey, error: manifestFailure(manifest.error), retry }
    : { status: manifest.isPending && status === 'ready' ? 'loading' : status, key: frameKey, error: frameError, retry }

  return {
    attachFrame,
    frame,
    setStage,
    board,
    params,
    setParams,
    canChangeParams: !playLocked,
    inFlight,
    canPlay: board !== null,
    play,
    playing: playLocked,
    sound,
    setSound,
  }
}
