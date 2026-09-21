import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installScrollbarFade } from './scrollbars'

describe('installScrollbarFade', () => {
  let uninstall: () => void
  let panel: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    panel = document.createElement('div')
    document.body.appendChild(panel)
    uninstall = installScrollbarFade()
  })

  afterEach(() => {
    uninstall()
    panel.remove()
    vi.useRealTimers()
  })

  it('marks the scrolling element and clears it after it goes still', () => {
    panel.dispatchEvent(new Event('scroll'))
    expect(panel).toHaveAttribute('data-scrolling')

    vi.advanceTimersByTime(500)
    panel.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(500)
    expect(panel).toHaveAttribute('data-scrolling')

    vi.advanceTimersByTime(500)
    expect(panel).not.toHaveAttribute('data-scrolling')
  })

  it('marks the root when the document itself scrolls', () => {
    document.dispatchEvent(new Event('scroll'))
    expect(document.documentElement).toHaveAttribute('data-scrolling')
    vi.advanceTimersByTime(1000)
    expect(document.documentElement).not.toHaveAttribute('data-scrolling')
  })

  it('stops marking once uninstalled', () => {
    uninstall()
    panel.dispatchEvent(new Event('scroll'))
    expect(panel).not.toHaveAttribute('data-scrolling')
    uninstall = () => {}
  })
})
