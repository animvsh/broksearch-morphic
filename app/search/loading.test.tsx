import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Loading from './loading'

describe('search loading route', () => {
  it('shows answer-engine progress immediately', () => {
    render(<Loading />)

    expect(
      screen.getByRole('main', { name: 'Preparing search answer' })
    ).toBeInTheDocument()
    expect(screen.getByTestId('search-route-loading')).toHaveTextContent(
      'Preparing your answer'
    )
    expect(screen.getByText('Searching web')).toBeInTheDocument()
    expect(screen.getByText('Reading sources')).toBeInTheDocument()
    expect(screen.getByText('Writing answer')).toBeInTheDocument()
    expect(screen.getByText('Drafting answer from sources')).toBeInTheDocument()
  })
})
