const VERSION = 1

const shapes = {
  configure: {
    rows: (v) => Number.isInteger(v) && v >= 8 && v <= 16,
    risk: (v) => v === 'low' || v === 'normal' || v === 'high',
    multipliers_hundredths: (v) => Array.isArray(v) && v.every((m) => Number.isInteger(m) && m > 0),
    sound: (v) => typeof v === 'boolean',
  },
  drop: {
    round_id: (v) => typeof v === 'string' && v.length > 0 && v.length <= 64,
    slot: (v) => Number.isInteger(v) && v >= 0 && v <= 16,
    multiplier_hundredths: (v) => Number.isInteger(v) && v > 0,
    result_label: (v) => typeof v === 'string' && v.length <= 40,
  },
  set_sound: {
    enabled: (v) => typeof v === 'boolean',
  },
}

function classify(data) {
  if (typeof data !== 'object' || data === null) return { error: 'bad_message' }
  if (data.v !== VERSION) return { error: 'unsupported_version' }
  const shape = shapes[data.type]
  if (!shape) return { error: 'bad_message' }
  const keys = Object.keys(data).filter((key) => key !== 'v' && key !== 'type')
  const expected = Object.keys(shape)
  if (keys.length !== expected.length) return { error: 'bad_message' }
  for (const key of expected) {
    if (!(key in data) || !shape[key](data[key])) return { error: 'bad_message' }
  }
  if (data.type === 'configure' && data.multipliers_hundredths.length !== data.rows + 1) {
    return { error: 'bad_message' }
  }
  return { message: data }
}

// The frame talks only to the window that embeds it, on its own origin. Anything
// else is ignored; a malformed message from the right window is answered with an
// error so the host can see its own mistake.
export const bridge = {
  origin: window.location.origin,

  send(message) {
    if (window.parent === window) return
    window.parent.postMessage({ v: VERSION, ...message }, this.origin)
  },

  start(handlers) {
    window.addEventListener('message', (event) => {
      if (event.origin !== this.origin || event.source !== window.parent) return
      const { message, error } = classify(event.data)
      if (error) {
        this.send({ type: 'error', code: error, message: `Rejected a ${String(event.data?.type ?? 'message')}` })
        return
      }
      handlers[message.type](message)
    })
  },
}
