import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGameBridge, frameOriginOf, parseFrameMessage } from './bridge'
import type { HostMessage } from './schemas'

const ready = { v: 3, type: 'ready', game: 'plinko' }
const landed = { v: 3, type: 'landed', round_id: 'r1', slot: 4 }

describe('parseFrameMessage', () => {
  it('accepts the protocol messages', () => {
    expect(parseFrameMessage(ready)).toEqual(ready)
    expect(parseFrameMessage(landed)).toEqual(landed)
    expect(parseFrameMessage({ v: 3, type: 'error', code: 'runtime', message: 'boom' })).not.toBeNull()
  })

  it.each([
    ['an older version', { ...ready, v: 2 }],
    ['an unknown type', { v: 3, type: 'settle', round_id: 'r1' }],
    ['an extra field', { ...landed, win_minor: 5000 }],
    ['a fractional slot', { ...landed, slot: 4.5 }],
    ['a negative slot', { ...landed, slot: -1 }],
    ['a slot past the board', { ...landed, slot: 11 }],
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
    const sent = bridge.send({ v: 3, type: 'set_sound', enabled: false })
    expect(sent).toBe(true)
    expect(post).toHaveBeenCalledWith({ v: 3, type: 'set_sound', enabled: false }, window.location.origin)
    bridge.dispose()
  })

  it('refuses to send a message outside the protocol', () => {
    const { bridge } = mount()
    expect(() =>
      bridge.send({ v: 3, type: 'drop', round_id: 'r1', slot: 3, multiplier_hundredths: 1.5, result_label: '' }),
    ).toThrow()
    bridge.dispose()
  })

  it('sends the stage rect and refuses one with no size', () => {
    const { bridge } = mount()
    const post = vi.spyOn(iframe.contentWindow as Window, 'postMessage')
    const stage: Extract<HostMessage, { type: 'layout' }> = {
      v: 3,
      type: 'layout',
      x: 0,
      y: 96,
      width: 390,
      height: 413.4,
      controls: [],
    }
    expect(bridge.send(stage)).toBe(true)
    expect(post).toHaveBeenCalledWith(stage, window.location.origin)
    expect(() => bridge.send({ ...stage, width: 0 })).toThrow()
    expect(() => bridge.send({ ...stage, x: Number.NaN })).toThrow()
    bridge.dispose()
  })

  it('sends the rects the controls cover and refuses malformed ones', () => {
    const { bridge } = mount()
    const panel = { x: 632, y: 16, width: 340, height: 457 }
    const stage: Extract<HostMessage, { type: 'layout' }> = {
      v: 3,
      type: 'layout',
      x: 200,
      y: 16,
      width: 408,
      height: 457,
      controls: [panel],
    }
    expect(bridge.send(stage)).toBe(true)
    expect(() => bridge.send({ ...stage, controls: undefined } as never)).toThrow()
    expect(() => bridge.send({ ...stage, controls: [panel, panel, panel, panel, panel] })).toThrow()
    expect(() => bridge.send({ ...stage, controls: [{ ...panel, height: 0 }] })).toThrow()
    expect(() => bridge.send({ ...stage, controls: [{ ...panel, right: 972 }] as never })).toThrow()
    bridge.dispose()
  })

  it('configures only the ten-row board', () => {
    const { bridge } = mount()
    const configure: Extract<HostMessage, { type: 'configure' }> = {
      v: 3,
      type: 'configure',
      rows: 10,
      risk: 'normal',
      multipliers_hundredths: [1000, 500, 250, 150, 80, 50, 80, 150, 250, 500, 1000],
      sound: true,
    }
    expect(bridge.send(configure)).toBe(true)
    expect(() => bridge.send({ ...configure, multipliers_hundredths: [...configure.multipliers_hundredths, 1000] })).toThrow()
    bridge.dispose()
  })

  it('reports a detached frame and stops listening after dispose', () => {
    const { bridge, onMessage } = mount()
    iframe.remove()
    expect(bridge.send({ v: 3, type: 'set_sound', enabled: true })).toBe(false)
    bridge.dispose()
    window.dispatchEvent(new MessageEvent('message', { data: ready, origin: window.location.origin, source: window }))
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('resolves the frame origin against the page', () => {
    expect(frameOriginOf('/games/plinko/index.html')).toBe(window.location.origin)
  })
})
