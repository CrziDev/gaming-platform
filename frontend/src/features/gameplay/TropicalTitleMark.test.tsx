import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TropicalTitleMark } from './TropicalTitleMark'

describe('TropicalTitleMark', () => {
  it('names the game in full while the lettering reads as the logo', () => {
    render(<TropicalTitleMark name="Plinko Tropical" subtitle="RISK · PLAY · WIN" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Plinko Tropical' })
    expect(heading).toHaveTextContent('PLINKO')
    expect(screen.getByText('RISK · PLAY · WIN', { selector: 'p' })).toHaveClass('sr-only')
  })

  it('arches the subtitle along its own path', () => {
    const { container } = render(<TropicalTitleMark name="Plinko Tropical" subtitle="RISK · PLAY · WIN" />)
    const path = container.querySelector('[data-part="title-subtitle"] path')
    const textPath = container.querySelector('textPath')
    expect(textPath).toHaveTextContent('RISK · PLAY · WIN')
    expect(textPath?.getAttribute('href')).toBe(`#${path?.id}`)
  })

  it('loads its brush face with the mark, subset to the logo', () => {
    const { container } = render(<TropicalTitleMark name="Plinko Tropical" subtitle="RISK · PLAY · WIN" />)
    const link = container.ownerDocument.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="Kaushan+Script"]')
    expect(link?.href).toContain('text=PLINKO')
  })
})
