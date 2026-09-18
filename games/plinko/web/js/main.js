import { bridge } from './bridge.js'
import { physics } from './physics.js'
import { state } from './state.js'
import { ui } from './ui.js'

ui.mount(() => physics.resetBoard())
physics.init()
physics.onLanded = (round_id, slot) => bridge.send({ type: 'landed', round_id, slot })

bridge.start({
  configure(message) {
    state.rows = message.rows
    state.risk = message.risk
    state.multipliers = message.multipliers_hundredths
    state.sound = message.sound
    state.configured = true
    state.labels = []
    physics.resetBoard()
    ui.hideSplash()
  },

  drop(message) {
    // A drop before the board exists cannot be animated; the round is already
    // settled, so it is reported landed at once rather than lost.
    if (!state.configured || message.slot > state.rows) {
      bridge.send({ type: 'landed', round_id: message.round_id, slot: message.slot })
      return
    }
    physics.dropBall({ round_id: message.round_id, slot: message.slot, label: message.result_label })
  },

  set_sound(message) {
    state.sound = message.enabled
  },
})

window.addEventListener('error', (event) => {
  bridge.send({ type: 'error', code: 'runtime', message: String(event.message).slice(0, 200) })
})

bridge.send({ type: 'ready', game: 'plinko' })
