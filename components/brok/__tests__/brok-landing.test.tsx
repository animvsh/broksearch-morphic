import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BrokLanding } from '../brok-landing'

describe('BrokLanding', () => {
  it('routes signed-out primary CTAs to login', () => {
    render(<BrokLanding isSignedIn={false} />)

    expect(
      screen.getByRole('heading', {
        name: /search, code, and ship all in one place/i
      })
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('link', { name: /request invite/i })
        .map(link => link.getAttribute('href'))
    ).toEqual(['/auth/login', '/auth/login'])
    expect(screen.getByRole('search')).toHaveAttribute('action', '/search')
    expect(screen.getByRole('textbox', { name: /ask brok/i })).toHaveAttribute(
      'name',
      'q'
    )
    expect(screen.getByDisplayValue('quick')).toHaveAttribute('name', 'mode')
    expect(screen.getByText(/only \$7\/month/i)).toBeInTheDocument()
  })

  it('routes signed-in users without access to the pending page', () => {
    render(<BrokLanding isSignedIn />)

    expect(
      screen
        .getAllByRole('link', { name: /request invite/i })
        .map(link => link.getAttribute('href'))
    ).toEqual(['/auth/access-pending', '/auth/access-pending'])
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/auth/access-pending'
    )
  })
})
