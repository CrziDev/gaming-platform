import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGameBridge, frameOriginOf, parseFrameMessage } from './bridge'

const ready = { v: 1, type: 'ready', game: 'plinko' }
const landed = { v: 1, type: 'landed', round_id: 'r1', slot: 4 }

describe('parseFrameMessage', () => {
  it('accepts the protocol messages', () => {
    expect(parseFrameMessage(ready)).toEqual(ready)
    expect(parseFrameMessage(landed)).toEqual(landed)
    expect(parseFrameMessage({ v: 1, type: 'error', code: 'runtime', message: 'boom' })).not.toBeNull()
  })

  it.each([
    ['another version', { ...ready, v: 2 }],
    ['an unknown type', { v: 1, type: 'settle', round_id: 'r1' }],
    ['an extra field', { ...landed, win_minor: 5000 }],
    ['a fractional slot', { ...landed, slot: 4.5 }],
    ['a negative slot', { ...landed, slot: -1 }],
    ['a slot past the widest board', { ...landed, slot: 17 }],
    ['a string', 'ready'],
    ['null', null],
  ])('rejects %s', (_label, data) => {
    expect(parseFrameMessage(data)).toBeNull()
  })
})

describe('createGameBridge', () => {
  let iframe: HTMLIFrameElement

  afterEach(() => {
    iframe?.remove()
  })

  function mount() {
    iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    const onMessage = vi.fn()
    const onRejected = vi.fn()
    const bridge = createGameBridge({ iframe, origin: window.location.origin, onMessage, onRejected })
    return { bridge, onMessage, onRejected }
  }

  function deliver(data: unknown, overrides: Partial<MessageEventInit> = {}) {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: window.location.origin,
        source: iframe.contentWindow,
        ...overrides,
      }),
    )
  }

  it('hands on a valid message from the frame window', () => {
    const { bridge, onMessage, onRejected } = mount()
    deliver(ready)
    expect(onMessage).toHaveBeenCalledWith(ready)
    expect(onRejected).not.toHaveBeenCalled()
    bridge.dispose()
  })

  it('drops a message from another origin', () => {
    const { bridge, onMessage, onRejected } = mount()
    deliver(ready, { origin: 'https://evil.example' })
    expect(onMessage).not.toHaveBeenCalled()
    expect(onRejected).toHaveBeenCalledWith('origin')
    bridge.dispose()
  })

  it('drops a message from a window other than the iframe', () => {
    const { bridge, onMessage, onRejected } = mount()
    deliver(ready, { source: window })
    expect(onMessage).not.toHaveBeenCalled()
    expect(onRejected).toHaveBeenCalledWith('source')
    bridge.dispose()
  })

  it('drops a message that fails the schema', () => {
    const { bridge, onMessage, onRejected } = mount()
    deliver({ ...landed, slot: 99 })
    expect(onMessage).not.toHaveBeenCalled()
    expect(onRejected).toHaveBeenCalledWith('shape')
    bridge.dispose()
  })

  it('posts to the frame with the exact origin, never a wildcard', () => {
    const { bridge } = mount()
    const post = vi.spyOn(iframe.contentWindow as Window, 'postMessage')
    const sent = bridge.send({ v: 1, type: 'set_sound', enabled: false })
    expect(sent).toBe(true)
    expect(post).toHaveBeenCalledWith({ v: 1, type: 'set_sound', enabled: false }, window.location.origin)
    bridge.dispose()
  })

  it('refuses to send a message outside the protocol', () => {
    const { bridge } = mount()
    expect(() =>
      bridge.send({ v: 1, type: 'drop', round_id: 'r1', slot: 3, multiplier_hundredths: 1.5, result_label: '' }),
    ).toThrow()
    bridge.dispose()
  })

  it('reports a detached frame and stops listening after dispose', () => {
    const { bridge, onMessage } = mount()
    iframe.remove()
    expect(bridge.send({ v: 1, type: 'set_sound', enabled: true })).toBe(false)
    bridge.dispose()
    window.dispatchEvent(new MessageEvent('message', { data: ready, origin: window.location.origin, source: window }))
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('resolves the frame origin against the page', () => {
    expect(frameOriginOf('/games/plinko/index.html')).toBe(window.location.origin)
  })
})
