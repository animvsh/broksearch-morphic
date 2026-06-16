import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/actions/access-requests', () => ({
  submitAccessRequest: vi.fn()
}))

import { AccessRequestForm } from '../access-request-form'

describe('AccessRequestForm', () => {
  it('renders email and phone fields with the request access action', () => {
    render(<AccessRequestForm defaultEmail="pending@example.com" />)

    expect(
      screen.getByRole('heading', { name: /request access/i })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toHaveValue('pending@example.com')
    expect(screen.getByLabelText(/phone number/i)).toHaveAttribute(
      'type',
      'tel'
    )
    expect(
      screen.getByRole('button', { name: /request access/i })
    ).toBeInTheDocument()
  })

  it('can render compactly for login, signup, and pending surfaces', () => {
    render(<AccessRequestForm compact />)

    expect(
      screen.queryByRole('heading', { name: /request access/i })
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument()
  })
})
