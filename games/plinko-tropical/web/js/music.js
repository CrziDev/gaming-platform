import { state } from './state.js'

// Quiet music under the round: a hint of it, kept well below the board's own
// sounds. It fades in once the browser lets the frame play, and out when sound is turned
// off or the page is hidden. The recording and its cut are in audio/SOURCES.txt.
const SOURCE = 'audio/viajes.mp3'
const VOLUME = 0.17
const FADE_IN = 3
const FADE_OUT = 0.4

export const music = {
  element: null,
  context: null,
  gain: null,
  playing: false,
  pauseTimer: 0,

  // A frame may start sound only after the player has used the page, so this runs again
  // on every message from the host; until then a refused start changes nothing.
  sync() {
    try {
      if (state.configured && state.sound && !document.hidden) this.play()
      else this.stop()
    } catch {
      // Music is a garnish; a browser without it still plays the round.
    }
  },

  play() {
    if (!this.element) this.create()
    clearTimeout(this.pauseTimer)
    if (this.context.state === 'suspended') this.context.resume().catch(() => {})
    if (this.playing) return
    this.playing = true
    this.element
      .play()
      .then(() => {
        if (this.playing) this.fade(VOLUME, FADE_IN)
      })
      .catch(() => {
        this.playing = false
      })
  },

  stop() {
    if (!this.playing) return
    this.playing = false
    this.fade(0, FADE_OUT)
    this.pauseTimer = setTimeout(() => this.element.pause(), FADE_OUT * 1000)
  },

  // The level is set through Web Audio because a media element's own volume is fixed on
  // iOS.
  create() {
    this.element = new Audio(SOURCE)
    this.element.loop = true
    this.context = new AudioContext()
    this.gain = this.context.createGain()
    this.gain.gain.value = 0
    this.context.createMediaElementSource(this.element).connect(this.gain)
    this.gain.connect(this.context.destination)
  },

  fade(to, seconds) {
    const level = this.gain.gain
    const now = this.context.currentTime
    level.cancelScheduledValues(now)
    level.setValueAtTime(level.value, now)
    level.linearRampToValueAtTime(to, now + seconds)
  },
}
