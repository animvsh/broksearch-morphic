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

    fireEvent.change(screen.getByRole('textbox', { name: 'Search query' }), {
      target: { value: 'best study plan for finals' }
    })
    fireEvent.click(screen.getByRole('button', { name: /send query/i }))

    expect(mocks.push).toHaveBeenCalledWith(
      '/search?q=best+study+plan+for+finals&mode=quick'
    )
  })

  it('shows the MVP example prompts and lets users start from one', () => {
    render(<SearchLanding />)

    expect(
      screen.getByText('What is the best way to learn React?')
    ).toBeInTheDocument()
    expect(screen.getByText('Compare Cursor vs Windsurf')).toBeInTheDocument()
    expect(screen.getByText('Summarize the latest AI news')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Compare Cursor vs Windsurf/i })
    )

    expect(screen.getByRole('textbox', { name: 'Search query' })).toHaveValue(
      'Compare Cursor vs Windsurf'
    )
  })
})
