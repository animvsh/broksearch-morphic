import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/search/pending-answer', () => ({
  PendingAnswer: () => (
    <div data-testid="pending-answer" aria-label="Preparing answer">
      Preparing answer
    </div>
  )
}))

import Loading from './loading'

describe('app/search/loading', () => {
  it('shows an answer-shaped search loading shell', () => {
    render(<Loading />)

    expect(screen.getByText('Starting Brok Search')).toBeInTheDocument()
    expect(screen.getByTestId('pending-answer')).toHaveAccessibleName(
      'Preparing answer'
    )
  })
})
