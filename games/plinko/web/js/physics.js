import { state } from './state.js'
import { theme } from './theme.js'
import { ui } from './ui.js'

const Matter = window.Matter

const ACTIVE_MS = 260
const LABEL_MS = 900
const STUCK_MS = 12_000

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

export const physics = {
  engine: null,
  world: null,
  balls: [],
  pegBodies: [],
  pegContactCounts: new Map(),
  audioCtx: null,
  onLanded: null,

  init() {
    this.engine = Matter.Engine.create()
    this.engine.gravity.y = 1.45
    this.world = this.engine.world

    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const peg = pegFromPair(pair)
        if (!peg) continue
        const index = Number(peg.label.slice(4))
        this.pegContactCounts.set(index, (this.pegContactCounts.get(index) || 0) + 1)
        this.playTick()
      }
    })

    Matter.Events.on(this.engine, 'collisionEnd', (event) => {
      for (const pair of event.pairs) {
        const peg = pegFromPair(pair)
        if (!peg) continue
        const index = Number(peg.label.slice(4))
        const count = (this.pegContactCounts.get(index) || 1) - 1
        if (count <= 0) this.pegContactCounts.delete(index)
        else this.pegContactCounts.set(index, count)
      }
    })

    this.resetBoard()
    this.startGameLoop()
  },

  // Everything below the top offset scales with the peg spacing: the rows, the
  // gap to the ribbon (55 units), the ribbon (30) and its label margin (8), all
  // in units of spacing / 28. The board is width-driven, shrunk to fit the
  // height exactly when it must, and centred when it need not.
  getBoardConfig(rows, width, height) {
    const paddingX = width * (0.045 - (rows - 8) * 0.003)
    const usableWidth = width - paddingX * 2
    const maxPegs = rows + 2
    let spacingX = usableWidth / (maxPegs - 1)
    let topOffset = Math.max(68, 110 - (rows - 8) * 4.5)

    const perSpacing = (rows - 1) * 0.85 + 93 / 28
    const available = height * 0.985
    const needed = topOffset + spacingX * perSpacing
    if (needed > available) {
      spacingX = (available - topOffset) / perSpacing
    } else {
      topOffset += (available - needed) / 2
    }

    const pegRadius = spacingX * 0.145
    const gap = spacingX - 2 * pegRadius
    return {
      spacingX,
      spacingY: spacingX * 0.85,
      pegRadius,
      ballRadius: (gap * 0.88) / 2,
      scale: spacingX / 28,
      topOffset,
    }
  },

  // Rebuilds the peg triangle for the configured rows. A ball still falling is
  // reported as landed in its own slot first, so the host never waits on it.
  resetBoard() {
    if (!this.world || !ui.canvas) return

    for (const ball of this.balls) this.settle(ball)
    this.balls = []
    Matter.World.clear(this.world, false)
    this.pegBodies = []
    this.pegContactCounts.clear()

    const config = this.getBoardConfig(state.rows, ui.width, ui.height)
    for (let row = 0; row < state.rows; row++) {
      const count = row + 3
      const startX = (ui.width - (count - 1) * config.spacingX) / 2
      for (let column = 0; column < count; column++) {
        this.pegBodies.push(
          Matter.Bodies.circle(startX + column * config.spacingX, config.topOffset + row * config.spacingY, config.pegRadius, {
            isStatic: true,
            label: `peg-${this.pegBodies.length}`,
            restitution: 0.85,
            friction: 0.05,
          }),
        )
      }
    }
    Matter.World.add(this.world, this.pegBodies)
  },

  dropBall({ round_id, slot, label }) {
    if (!this.world || !ui.canvas) return

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }

    const config = this.getBoardConfig(state.rows, ui.width, ui.height)
    const body = Matter.Bodies.circle(ui.width / 2 + (Math.random() - 0.5) * 3, config.topOffset - 50, config.ballRadius, {
      restitution: 0.35,
      friction: 0.02,
      frictionAir: 0.045,
      collisionFilter: { group: -1 },
    })
    Matter.Body.setVelocity(body, { x: (Math.random() - 0.5) * 0.4, y: 1 })

    this.balls.push({ body, round_id, slot, label, born: performance.now() })
    Matter.World.add(this.world, body)
  },

  settle(ball) {
    Matter.World.remove(this.world, ball.body)
    if (this.onLanded) this.onLanded(ball.round_id, ball.slot)
  },

  startGameLoop() {
    const loop = () => {
      if (this.engine && ui.ctx) {
        Matter.Engine.update(this.engine, 1000 / 60)
        this.render()
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  },

  render() {
    const ctx = ui.ctx
    const { width, height } = ui
    const colors = theme.colors
    const now = performance.now()
    ctx.clearRect(0, 0, width, height)

    const config = this.getBoardConfig(state.rows, width, height)

    for (let index = 0; index < this.pegBodies.length; index++) {
      const { x, y } = this.pegBodies[index].position
      const contact = this.pegContactCounts.has(index)
      ctx.beginPath()
      ctx.arc(x, y, contact ? config.pegRadius * 1.25 : config.pegRadius, 0, Math.PI * 2)
      ctx.fillStyle = contact ? colors.pegHit : colors.inkMute
      ctx.fill()
    }

    const holeY = config.topOffset - 50
    const holeRadius = config.ballRadius * 1.45
    ctx.beginPath()
    ctx.arc(width / 2, holeY, holeRadius + 3.5 * config.scale, 0, Math.PI * 2)
    ctx.fillStyle = colors.surface2
    ctx.fill()
    ctx.beginPath()
    ctx.arc(width / 2, holeY, holeRadius, 0, Math.PI * 2)
    ctx.fillStyle = colors.panel
    ctx.fill()

    const table = state.multipliers
    const slotY = config.topOffset + (state.rows - 1) * config.spacingY + 55 * config.scale
    const slotWidth = config.spacingX * 0.94
    const slotHeight = 30 * config.scale
    const slotX = (width - (table.length - 1) * config.spacingX) / 2
    const withSign = config.spacingX >= 30
    const fontSize = Math.max(8, Math.min(12, 11 * config.scale))
    const lift = reducedMotion.matches ? 0 : -6 * config.scale

    if (state.activeSlot !== null && now > state.activeUntil) state.activeSlot = null
    state.labels = state.labels.filter((entry) => entry.until > now)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let index = 0; index < table.length; index++) {
      const x = slotX + index * config.spacingX
      const active = state.activeSlot === index
      const y = slotY + (active ? lift : 0)
      const band = theme.bucketBand(index, table.length)

      ctx.beginPath()
      ctx.roundRect(x - slotWidth / 2, y, slotWidth, slotHeight, 4 * config.scale)
      ctx.fillStyle = band.fill
      ctx.fill()
      if (active) {
        ctx.lineWidth = 2
        ctx.strokeStyle = colors.ink
        ctx.stroke()
      }

      ctx.fillStyle = band.ink
      ctx.font = `500 ${fontSize}px ${colors.mono}`
      ctx.fillText(ui.formatMultiplier(table[index], withSign), x, y + slotHeight / 2)
    }

    for (const entry of state.labels) {
      const x = slotX + entry.slot * config.spacingX
      ctx.fillStyle = colors.win
      ctx.font = `500 ${Math.max(11, 12 * config.scale)}px ${colors.mono}`
      ctx.fillText(entry.text, x, slotY - 14 * config.scale)
    }

    const lastPegY = config.topOffset + (state.rows - 1) * config.spacingY
    const halfLane = slotWidth / 2 - config.ballRadius

    this.balls = this.balls.filter((ball) => {
      const { body } = ball
      const { x, y } = body.position
      const targetX = slotX + ball.slot * config.spacingX

      // The original steering: a pull toward the target that strengthens as the
      // ball descends, so the bounces stay real but the destination does not.
      if (y > config.topOffset) {
        const progress = Math.max(0, Math.min(1, (y - config.topOffset) / (slotY - config.topOffset)))
        const pull = 0.0035 + progress * 0.009
        Matter.Body.setVelocity(body, { x: body.velocity.x + (targetX - x) * pull, y: body.velocity.y })
      }

      // Below the last peg there is nothing left to bounce off, so the ball is
      // held inside its bucket's lane. The host already settled this slot.
      if (y > lastPegY + config.pegRadius + config.ballRadius) {
        const clampedX = Math.max(targetX - halfLane, Math.min(targetX + halfLane, x))
        if (clampedX !== x) {
          Matter.Body.setPosition(body, { x: clampedX, y })
          Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y })
        }
      }

      ctx.beginPath()
      ctx.arc(body.position.x, body.position.y, config.ballRadius, 0, Math.PI * 2)
      ctx.fillStyle = colors.ball
      ctx.fill()

      const stuck = now - ball.born > STUCK_MS
      if (y > slotY - 4 || stuck) {
        state.activeSlot = ball.slot
        state.activeUntil = now + ACTIVE_MS
        if (ball.label) state.labels.push({ slot: ball.slot, text: ball.label, until: now + LABEL_MS })
        this.settle(ball)
        return false
      }
      return true
    })
  },

  playTick() {
    if (!state.sound) return
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext()
      const audio = this.audioCtx
      if (audio.state === 'suspended') return

      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(850 + Math.random() * 200, audio.currentTime)
      gain.gain.setValueAtTime(0.06, audio.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.04)
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.start()
      osc.stop(audio.currentTime + 0.04)
    } catch {
      // Audio is a garnish; a browser without it still plays the round.
    }
  },
}

function pegFromPair(pair) {
  if (pair.bodyA.label?.startsWith('peg-')) return pair.bodyA
  if (pair.bodyB.label?.startsWith('peg-')) return pair.bodyB
  return null
}
