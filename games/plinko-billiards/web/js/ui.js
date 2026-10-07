// The frame's DOM around the canvas: the brand taglines beside the table, the result
// toast over the pocket that paid, and a big win's multiplier across the table.
export const ui = {
  scene: null,
  toasts: null,
  bigWinShown: null,
  taglines: null,

  mount() {
    this.scene = document.getElementById('scene')
    this.toasts = document.getElementById('toasts')
    this.taglines = {
      left: document.getElementById('tagline-left'),
      right: document.getElementById('tagline-right'),
    }
  },

  // The taglines stand in the gutters between each edge of the frame and whatever is
  // nearest at their height, the left one high on the pane and the right one at
  // mid-depth. That is the glass, measured down to the tagline's foot, or a host control
  // beside the board. Where the gutter has room they stand a short reach from what they
  // are beside, and no nearer the frame's edge than its inset; otherwise they centre in
  // the gutter. When either gutter cannot hold its tagline clear, both step aside.
  placeTaglines(board, width, controls) {
    const { left, right } = this.taglines
    const centre = (board.left + board.right) / 2
    const depth = board.bottom - board.top
    const leftTop = board.top + depth * 0.13
    const rightTop = board.top + depth * 0.45
    const leftBeside = beside(controls, leftTop, left.offsetHeight)
    const rightBeside = beside(controls, rightTop, right.offsetHeight)
    const leftGutter = Math.min(
      centre - board.halfWidthAt(leftTop + left.offsetHeight),
      ...leftBeside.map((rect) => rect.x),
    )
    const rightGutter =
      width -
      Math.max(
        centre + board.halfWidthAt(rightTop + right.offsetHeight),
        ...rightBeside.map((rect) => rect.x + rect.width),
      )
    const leftOffset = fitTagline(left, leftGutter)
    const rightOffset = fitTagline(right, rightGutter)
    const visibility = leftOffset !== null && rightOffset !== null ? 'visible' : 'hidden'
    Object.assign(left.style, { top: `${leftTop}px`, left: `${leftOffset ?? 0}px`, visibility })
    Object.assign(right.style, { top: `${rightTop}px`, right: `${rightOffset ?? 0}px`, visibility })
  },

  // Below the stage the scene fades into the page ground, so the host's round history
  // starts on the same black. Where the stage reaches the frame's foot nothing fades.
  placeFoot(stageBottom) {
    document.documentElement.style.setProperty('--stage-bottom', `${stageBottom}px`)
  },

  // The host formats the amount; the frame only places it. Wins read green, returns
  // under the stake read grey.
  toast(x, y, text, win) {
    const toast = document.createElement('div')
    toast.className = win ? 'toast toast-win' : 'toast'
    toast.textContent = text
    toast.style.left = `${x}px`
    toast.style.top = `${y}px`
    this.toasts.appendChild(toast)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTimeout(() => toast.remove(), 1300)
      return
    }
    toast.animate(
      [
        { opacity: 0, transform: 'translate(-50%,-30%)' },
        { opacity: 1, transform: 'translate(-50%,-60%)', offset: 0.2 },
        { opacity: 1, transform: 'translate(-50%,-100%)', offset: 0.75 },
        { opacity: 0, transform: 'translate(-50%,-150%)' },
      ],
      { duration: 1300, easing: 'ease-out' },
    ).onfinish = () => toast.remove()
  },

  // A big win's multiplier stands across the middle of the stage over the host's
  // amount, instead of the toast over the pocket. A newer one replaces it.
  bigWin(stage, hundredths, label) {
    this.bigWinShown?.remove()
    const card = document.createElement('div')
    card.className = 'big-win'
    const times = document.createElement('div')
    times.className = 'big-win-times'
    times.textContent = `${this.formatMultiplier(hundredths).slice(0, -1)}×`
    const amount = document.createElement('div')
    amount.className = 'big-win-amount'
    amount.textContent = label
    card.append(times, amount)
    card.style.left = `${stage.x + stage.width / 2}px`
    card.style.top = `${stage.y + stage.height * 0.42}px`
    card.style.setProperty('--big-win-size', `${Math.round(Math.min(96, Math.max(48, stage.width * 0.17)))}px`)
    this.toasts.appendChild(card)
    this.bigWinShown = card

    const done = () => {
      card.remove()
      if (this.bigWinShown === card) this.bigWinShown = null
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTimeout(done, 1800)
      return
    }
    card.animate(
      [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(.7)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1.06)', offset: 0.12 },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.22 },
        { opacity: 1, transform: 'translate(-50%,-56%) scale(1)', offset: 0.8 },
        { opacity: 0, transform: 'translate(-50%,-70%) scale(1)' },
      ],
      { duration: 1800, easing: 'ease-out' },
    ).onfinish = done
  },

  // 170 reads 1.7x, 600 reads 6x, 50 reads 0.5x.
  formatMultiplier(hundredths) {
    const whole = Math.floor(hundredths / 100)
    const fraction = hundredths % 100
    const text = fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`
    return `${text}x`
  },
}

const TAGLINE_CLEARANCE = 8
const TAGLINE_EDGE_INSET = 40
const TAGLINE_REACH = 40

// The host controls that share any height with a tagline standing at top.
function beside(controls, top, height) {
  return controls.filter((rect) => rect.y < top + height && rect.y + rect.height > top)
}

// The tagline's offset from its own edge of the frame, or null when the gutter between
// that edge and the nearest obstacle cannot hold it clear of both.
function fitTagline(tagline, gutter) {
  const width = tagline.offsetWidth
  if (TAGLINE_EDGE_INSET + width <= gutter - TAGLINE_CLEARANCE) {
    return Math.max(TAGLINE_EDGE_INSET, gutter - TAGLINE_REACH - width)
  }
  const offset = (gutter - width) / 2
  return offset >= TAGLINE_CLEARANCE && offset + width <= gutter - TAGLINE_CLEARANCE ? offset : null
}
