import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LedgerStatus } from './LedgerStatus'

describe('LedgerStatus', () => {
  it('shows nothing for an applied movement, the normal state', () => {
    const { container } = render(<LedgerStatus status="applied" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('badges any other state', () => {
    render(<LedgerStatus status="pending" />)
    expect(screen.getByText('pending')).toBeInTheDocument()
  })
})
