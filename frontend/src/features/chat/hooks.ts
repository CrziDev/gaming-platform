import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { socketUrl } from '@/api/client'
import { usingFixtures } from '@/api/mode'

import { fetchChatRoom, sendChatMessage } from './api'

const chatQueryKey = ['chat'] as const

export function useChatRoom(enabled: boolean) {
  return useQuery({ queryKey: chatQueryKey, queryFn: fetchChatRoom, enabled })
}

export function useSendChatMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sendChatMessage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatQueryKey }),
  })
}

type SocketEvent = { type: 'message' } | { type: 'presence'; online: number }

function parseEvent(raw: unknown): SocketEvent | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return null
    if (parsed.type === 'message') return { type: 'message' }
    if (parsed.type === 'presence' && 'online' in parsed && typeof parsed.online === 'number') {
      return { type: 'presence', online: parsed.online }
    }
  } catch {
    return null
  }
  return null
}

const reconnectFloorMs = 1_000
const reconnectCeilingMs = 30_000

// The socket only says that the room changed; the room itself is always read
// through the query, so a push and a refetch can never disagree. Presence is
// pushed as a number and held here because nothing fetches it on its own.
export function useChatSocket(enabled: boolean): { online: number | null } {
  const queryClient = useQueryClient()
  const [online, setOnline] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled || usingFixtures) return
    let socket: WebSocket | null = null
    let timer: number | undefined
    let delay = reconnectFloorMs
    let stopped = false

    const connect = () => {
      socket = new WebSocket(socketUrl('/chat/socket'))
      socket.addEventListener('open', () => {
        delay = reconnectFloorMs
        void queryClient.invalidateQueries({ queryKey: chatQueryKey })
      })
      socket.addEventListener('message', (event: MessageEvent<unknown>) => {
        const parsed = parseEvent(event.data)
        if (parsed?.type === 'message') {
          void queryClient.invalidateQueries({ queryKey: chatQueryKey })
        } else if (parsed?.type === 'presence') {
          setOnline(parsed.online)
        }
      })
      socket.addEventListener('close', () => {
        socket = null
        setOnline(null)
        if (stopped) return
        timer = window.setTimeout(connect, delay)
        delay = Math.min(delay * 2, reconnectCeilingMs)
      })
    }
    connect()

    return () => {
      stopped = true
      window.clearTimeout(timer)
      socket?.close()
    }
  }, [enabled, queryClient])

  return { online }
}
