import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SearchLanding } from '../search-landing'

const mocks = vi.hoisted(() => ({
  push: vi.fn()
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push
  })
}))

describe('SearchLanding', () => {
  beforeEach(() => {
    mocks.push.mockClear()
  })

  it('routes submitted searches through the chat creation route', () => {
    render(<SearchLanding />)

    fireEvent.change(screen.getByPlaceholderText('Ask anything...'), {
      target: { value: 'best study plan for finals' }
    })
    fireEvent.click(screen.getByRole('button', { name: /send query/i }))

    expect(mocks.push).toHaveBeenCalledWith(
      '/search?q=best+study+plan+for+finals&mode=quick'
    )
  })
})
