// The frame's DOM around the canvas: the brand taglines beside the board and the
// result toast over the cup that paid.
export const ui = {
  scene: null,
  toasts: null,
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
