import { frameMessageSchema, hostMessageSchema, type FrameMessage, type HostMessage } from './schemas'

export function frameOriginOf(frameUrl: string): string {
  return new URL(frameUrl, window.location.href).origin
}

export function parseFrameMessage(data: unknown): FrameMessage | null {
  const parsed = frameMessageSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

export type RejectedReason = 'origin' | 'source' | 'shape'

type BridgeOptions = {
  iframe: HTMLIFrameElement
  origin: string
  onMessage: (message: FrameMessage) => void
  onRejected?: (reason: RejectedReason) => void
}

export type GameBridge = {
  send: (message: HostMessage) => boolean
  dispose: () => void
}

// The only listener for frame traffic. A message is handed on solely when it
// comes from the expected origin, from this iframe's own window, and parses
// against the protocol; anything else is dropped and reported, never handled.
export function createGameBridge({ iframe, origin, onMessage, onRejected }: BridgeOptions): GameBridge {
  const listener = (event: MessageEvent) => {
    if (event.origin !== origin) {
      onRejected?.('origin')
      return
    }
    if (event.source === null || event.source !== iframe.contentWindow) {
      onRejected?.('source')
      return
    }
    const message = parseFrameMessage(event.data)
    if (!message) {
      onRejected?.('shape')
      return
    }
    onMessage(message)
  }

  window.addEventListener('message', listener)

  return {
    send(message) {
      const target = iframe.contentWindow
      if (!target || !iframe.isConnected) return false
      target.postMessage(hostMessageSchema.parse(message), origin)
      return true
    },
    dispose() {
      window.removeEventListener('message', listener)
    },
  }
}
