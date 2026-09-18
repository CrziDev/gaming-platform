import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react'

import { ApiError } from '@/api/client'
import type { GameFrameStatus } from '@/components/game/GameHost'
import { useToast } from '@/components/ui/Toast'
import { walletQueryKey } from '@/features/wallet'
import { formatMoney, money, type Currency } from '@/lib/money'
import { useRememberedChoice } from '@/lib/remembered'

import { createGameBridge, frameOriginOf, type GameBridge } from './bridge'
import { useGameSound, usePlayRound } from './hooks'
import { PLINKO_RISKS, PLINKO_ROWS, type PlinkoParams } from './multipliers'
import type { GameModule } from './registry'
import { PROTOCOL_VERSION, type FrameMessage } from './schemas'

const READY_TIMEOUT_MS = 10_000
const SETTLE_FALLBACK_MS = 8_000

export type GameSession = {
  attachFrame: Ref<HTMLIFrameElement | null>
  frame: { status: GameFrameStatus; key: number; error?: string | undefined; retry: () => void }
  params: PlinkoParams
  setParams: (params: PlinkoParams) => void
  canChangeParams: boolean
  inFlight: number
  play: (stakeMinor: number) => Promise<void>
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

const rowChoices = PLINKO_ROWS.map(String)

// Runs one game page: the frame's lifecycle, the bridge, and every round from
// request to landing. The server settles a round before the
// ball is dropped; this hook only decides when the settled truth is refetched,
// which is when the ball lands or, failing that, a few seconds later.
export function useGameSession({ module, slug, currency, onShortfall }: GameSessionOptions): GameSession {
  const queryClient = useQueryClient()
  const toast = useToast()
  const mutation = usePlayRound()
  const [sound, setSound] = useGameSound()

  // A callback ref, so the bridge is built when the iframe actually mounts —
  // which is after the game loads, and again after every retry.
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const attachFrame = useCallback((node: HTMLIFrameElement | null) => setIframe(node), [])
  const bridgeRef = useRef<GameBridge | null>(null)
  const pendingRef = useRef(new Map<string, number>())

  const [status, setStatus] = useState<GameFrameStatus>('loading')
  const [frameKey, setFrameKey] = useState(0)
  const [frameError, setFrameError] = useState<string>()
  const [inFlight, setInFlight] = useState(0)

  const [rememberedRows, rememberRows] = useRememberedChoice(`game.${slug}.rows`, rowChoices)
  const [rememberedRisk, rememberRisk] = useRememberedChoice(`game.${slug}.risk`, PLINKO_RISKS)
  const defaults = module?.defaultParams ?? { rows: 8, risk: 'normal' }
  const params: PlinkoParams = {
    rows: (PLINKO_ROWS.find((rows) => String(rows) === rememberedRows) ?? defaults.rows) as PlinkoParams['rows'],
    risk: rememberedRisk ?? defaults.risk,
  }

  // Handlers read the latest values through this ref. It is synced in a layout
  // effect so a click that follows a render can never see the previous frame state.
  const latest = useRef({ params, sound, status, module })
  useLayoutEffect(() => {
    latest.current = { params, sound, status, module }
  })

  const settle = useCallback(
    (roundId: string) => {
      const pending = pendingRef.current
      const timer = pending.get(roundId)
      if (timer === undefined) return
      window.clearTimeout(timer)
      pending.delete(roundId)
      setInFlight(pending.size)
      void queryClient.invalidateQueries({ queryKey: walletQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['rounds'] })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
    [queryClient],
  )

  const settleAll = useCallback(() => {
    for (const roundId of Array.from(pendingRef.current.keys())) settle(roundId)
  }, [settle])

  const configure = useCallback(() => {
    const { params: current, sound: enabled, module: active } = latest.current
    if (!active) return
    bridgeRef.current?.send({
      v: PROTOCOL_VERSION,
      type: 'configure',
      rows: current.rows,
      risk: current.risk,
      multipliers_hundredths: [...active.multipliers(current)],
      sound: enabled,
    })
  }, [])

  useEffect(() => {
    if (!module || !iframe) return

    const onMessage = (message: FrameMessage) => {
      switch (message.type) {
        case 'ready':
          // A second ready is a reloaded frame: whatever was falling is gone, and
          // every round it carried was settled before it was dropped.
          settleAll()
          setStatus('ready')
          setFrameError(undefined)
          configure()
          break
        case 'landed':
          settle(message.round_id)
          break
        case 'error':
          if (message.code === 'unsupported_version') {
            setStatus('error')
            setFrameError('This game page speaks a different protocol version.')
          } else {
            toast.push('The game reported a problem. Your rounds are still settled.', 'danger')
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
  }, [module, iframe, configure, settle, settleAll, toast])

  useEffect(() => {
    const pending = pendingRef.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
      pending.clear()
    }
  }, [])

  useEffect(() => {
    if (status === 'ready') configure()
  }, [status, params.rows, params.risk, configure])

  useEffect(() => {
    if (status === 'ready') bridgeRef.current?.send({ v: PROTOCOL_VERSION, type: 'set_sound', enabled: sound })
  }, [status, sound])

  const play = useCallback(
    async (stakeMinor: number) => {
      const { status: frameStatus, module: active, params: current } = latest.current
      if (!active) return

      try {
        const response = await mutation.mutateAsync({
          slug,
          stake_minor: stakeMinor,
          currency,
          params: current,
          idempotencyKey: crypto.randomUUID(),
        })

        const roundId = response.round.id
        const slot = response.result.slot
        const multiplier = response.round.multiplier_hundredths
        const label = formatMoney(money(response.round.win_minor ?? 0, currency), { sign: 'always' })

        pendingRef.current.set(
          roundId,
          window.setTimeout(() => settle(roundId), SETTLE_FALLBACK_MS),
        )
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
          toast.push(`Round settled without the animation: ${label}`)
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === 'INSUFFICIENT_BALANCE') {
          onShortfall()
          return
        }
        if (error instanceof ApiError && error.status === 404) {
          toast.push('Plinko is not available on this server yet.', 'danger')
          return
        }
        toast.push(error instanceof Error ? error.message : 'The round could not be placed.', 'danger')
      }
    },
    [currency, mutation, onShortfall, settle, slug, toast],
  )

  const setParams = useCallback(
    (next: PlinkoParams) => {
      rememberRows(String(next.rows))
      rememberRisk(next.risk)
    },
    [rememberRisk, rememberRows],
  )

  const retry = useCallback(() => {
    settleAll()
    setStatus('loading')
    setFrameError(undefined)
    setFrameKey((key) => key + 1)
  }, [settleAll])

  return {
    attachFrame,
    frame: { status, key: frameKey, error: frameError, retry },
    params,
    setParams,
    canChangeParams: inFlight === 0,
    inFlight,
    play,
    playing: mutation.isPending,
    sound,
    setSound,
  }
}
