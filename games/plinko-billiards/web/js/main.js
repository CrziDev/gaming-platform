import { board } from './board.js'
import { bridge } from './bridge.js'
import { state } from './state.js'
import { ui } from './ui.js'

window.addEventListener('error', (event) => {
  bridge.send({ type: 'error', code: 'runtime', message: String(event.message).slice(0, 200) })
})

// The glow and sharpen passes are optional: without them the board renders plain.
async function loadBloom() {
  try {
    const modules = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/postprocessing/ShaderPass.js'),
    ])
    return Object.assign({}, ...modules)
  } catch {
    return null
  }
}

// Cup labels are painted once into textures and the taglines are measured against their
// gutters, so their faces must be loaded first. A slow font download is not worth
// holding the board for.
async function loadFonts() {
  const fonts = Promise.all([
    document.fonts.load('700 80px Inter'),
    document.fonts.load('700 80px "IBM Plex Sans"'),
    document.fonts.load('500 16px "IBM Plex Sans Condensed"'),
  ])
  await Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 2500))]).catch(() => {})
}

async function boot() {
  const [THREE, bloom] = await Promise.all([import('three'), loadBloom(), loadFonts()])
  ui.mount()
  board.init(THREE, bloom, ui.scene)
  board.onLanded = (round_id, slot) => bridge.send({ type: 'landed', round_id, slot })

  bridge.start({
    configure(message) {
      state.risk = message.risk
      state.multipliers = message.multipliers_hundredths
      state.sound = message.sound
      state.configured = true
      board.setLabels()
    },

    layout(message) {
      state.stage = { x: message.x, y: message.y, width: message.width, height: message.height }
      state.controls = message.controls
      board.fit()
    },

    drop(message) {
      // A drop before the board is configured cannot be drawn; the round is already
      // settled, so it is reported landed at once rather than lost.
      if (!state.configured) {
        bridge.send({ type: 'landed', round_id: message.round_id, slot: message.slot })
        return
      }
      board.dropBall({
        round_id: message.round_id,
        slot: message.slot,
        label: message.result_label,
        multiplier: message.multiplier_hundredths,
      })
    },

    set_sound(message) {
      state.sound = message.enabled
    },
  })

  bridge.send({ type: 'ready', game: 'plinko' })
}

boot().catch((error) => {
  bridge.send({ type: 'error', code: 'runtime', message: String(error?.message ?? error).slice(0, 200) })
})
