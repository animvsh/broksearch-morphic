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
  const storage = new Map<string, string>()

  beforeEach(() => {
    mocks.push.mockClear()
    storage.clear()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value)
        }),
        removeItem: vi.fn((key: string) => {
          storage.delete(key)
        }),
        clear: vi.fn(() => {
          storage.clear()
        })
      }
    })
    window.localStorage.clear()
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
    expect(window.localStorage.setItem).toHaveBeenCalledTimes(1)
  })

  it('shows the MVP example prompts and starts from one immediately', () => {
    render(<SearchLanding />)

    expect(
      screen.getByText('What is the best way to learn React?')
    ).toBeInTheDocument()
    expect(screen.getByText('Compare Cursor vs Windsurf')).toBeInTheDocument()
    expect(screen.getByText('Summarize the latest AI news')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Compare Cursor vs Windsurf/i })
    )

    expect(mocks.push).toHaveBeenCalledWith(
      '/search?q=Compare+Cursor+vs+Windsurf&mode=search'
    )
  })

  it('starts recent searches with their saved mode', () => {
    window.localStorage.setItem(
      'brok:recent-searches',
      JSON.stringify([
        {
          id: 'recent-1',
          query: 'Deep dive on synthetic biology funding',
          mode: 'deep',
          createdAt: Date.now()
        }
      ])
    )

    render(<SearchLanding />)

    fireEvent.click(
      screen.getByRole('button', {
        name: /Deep dive on synthetic biology funding/i
      })
    )

    expect(mocks.push).toHaveBeenCalledWith(
      '/search?q=Deep+dive+on+synthetic+biology+funding&mode=deep'
    )
  })
})
