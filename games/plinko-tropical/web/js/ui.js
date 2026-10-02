// The frame's DOM around the canvas: the brand line beside the board and the result
// toast over the tile that paid. The other brand line is painted on the backdrop's
// signboard.
export const ui = {
  scene: null,
  toasts: null,
  tagline: null,

  mount() {
    this.scene = document.getElementById('scene')
    this.toasts = document.getElementById('toasts')
    this.tagline = document.getElementById('tagline-left')
  },

  // The lettering stands in the left gutter high on the board, below any host control
  // over that side of the board's top half. The gutter runs from the frame's left edge
  // to whatever is nearest at its height: the board, measured down to the lettering's
  // foot, or a host control beside it. Where the gutter has room the lettering stands a
  // short reach from what it is beside, and no nearer the edge than its inset; otherwise
  // it centres in the gutter, and it steps aside when the gutter cannot hold it clear.
  placeTagline(board, controls) {
    const tagline = this.tagline
    const centre = (board.left + board.right) / 2
    const depth = board.bottom - board.top
    const over = controls.filter((rect) => rect.x < centre && rect.y < board.top + depth * 0.5)
    const top = Math.max(board.top + depth * 0.12, ...over.map((rect) => rect.y + rect.height + TAGLINE_CLEARANCE * 2))
    const gutter = Math.min(
      centre - board.halfWidthAt(top + tagline.offsetHeight),
      ...beside(controls, top, tagline.offsetHeight).map((rect) => rect.x),
    )
    const offset = fitTagline(tagline, gutter)
    Object.assign(tagline.style, {
      top: `${top}px`,
      left: `${offset ?? 0}px`,
      visibility: offset === null ? 'hidden' : 'visible',
    })
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

// The host controls that share any height with the lettering standing at top.
function beside(controls, top, height) {
  return controls.filter((rect) => rect.y < top + height && rect.y + rect.height > top)
}

// The lettering's offset from the frame's edge, or null when the gutter between that
// edge and the nearest obstacle cannot hold it clear of both.
function fitTagline(tagline, gutter) {
  const width = tagline.offsetWidth
  if (TAGLINE_EDGE_INSET + width <= gutter - TAGLINE_CLEARANCE) {
    return Math.max(TAGLINE_EDGE_INSET, gutter - TAGLINE_REACH - width)
  }
  const offset = (gutter - width) / 2
  return offset >= TAGLINE_CLEARANCE && offset + width <= gutter - TAGLINE_CLEARANCE ? offset : null
}
