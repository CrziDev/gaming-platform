const IDLE_MS = 900

// Marks whichever element is scrolling with `data-scrolling` and clears the mark
// once it has been still for a moment. The stylesheet draws a faint thumb at
// rest and a stronger one while the mark is present; a native scrollbar cannot
// be told about hover, so the mark is what the styles react to.
export function installScrollbarFade(target: Document = document): () => void {
  const timers = new WeakMap<Element, number>()

  const onScroll = (event: Event) => {
    const element = event.target === target ? target.documentElement : event.target
    if (!(element instanceof Element)) return

    element.setAttribute('data-scrolling', '')
    const pending = timers.get(element)
    if (pending !== undefined) window.clearTimeout(pending)
    timers.set(
      element,
      window.setTimeout(() => {
        element.removeAttribute('data-scrolling')
        timers.delete(element)
      }, IDLE_MS),
    )
  }

  target.addEventListener('scroll', onScroll, { capture: true, passive: true })
  return () => target.removeEventListener('scroll', onScroll, { capture: true })
}
