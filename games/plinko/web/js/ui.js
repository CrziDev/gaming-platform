export const ui = {
  canvas: null,
  ctx: null,
  width: 0,
  height: 0,

  mount(onResize) {
    this.canvas = document.getElementById('game-canvas')
    this.ctx = this.canvas.getContext('2d')

    const board = document.getElementById('board')
    const fit = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = board.getBoundingClientRect()
      this.width = Math.max(1, Math.round(rect.width))
      this.height = Math.max(1, Math.round(rect.height))
      this.canvas.width = Math.round(this.width * dpr)
      this.canvas.height = Math.round(this.height * dpr)
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      onResize()
    }
    fit()
    new ResizeObserver(fit).observe(board)

    // The platform's scrollbar treatment: mark whatever scrolls until it is still.
    const scrolling = new WeakMap()
    document.addEventListener(
      'scroll',
      (event) => {
        const element = event.target === document ? document.documentElement : event.target
        if (!(element instanceof Element)) return
        element.setAttribute('data-scrolling', '')
        clearTimeout(scrolling.get(element))
        scrolling.set(element, setTimeout(() => element.removeAttribute('data-scrolling'), 900))
      },
      { capture: true, passive: true },
    )

    const dialog = document.getElementById('how-to-dialog')
    document.getElementById('how-to').addEventListener('click', () => dialog.showModal())
    document.getElementById('how-to-close').addEventListener('click', () => dialog.close())
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close()
    })
  },

  hideSplash() {
    document.getElementById('splash').hidden = true
  },

  // 170 reads 1.7×, 600 reads 6×, 50000 reads 500×. The sign is dropped on a
  // narrow board where four glyphs no longer fit inside a bucket.
  formatMultiplier(hundredths, withSign = true) {
    const whole = Math.floor(hundredths / 100)
    const fraction = hundredths % 100
    const text = fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`
    return withSign ? `${text}×` : text
  },
}
