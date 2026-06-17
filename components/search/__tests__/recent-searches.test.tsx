import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RecentSearches, recordRecentSearch } from '../recent-searches'

describe('RecentSearches', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
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
  })

  it('renders saved recents with modes and can clear them', () => {
    window.localStorage.setItem(
      'brok:recent-searches',
      JSON.stringify([
        {
          id: 'recent-1',
          query: 'Compare Cursor vs Windsurf',
          mode: 'search',
          createdAt: Date.now()
        }
      ])
    )

    render(<RecentSearches onSelect={vi.fn()} />)

    expect(screen.getByText('Compare Cursor vs Windsurf')).toBeInTheDocument()
    expect(screen.getByText('search')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /clear recent/i }))

    expect(window.localStorage.removeItem).toHaveBeenCalledWith(
      'brok:recent-searches'
    )
    expect(
      screen.queryByText('Compare Cursor vs Windsurf')
    ).not.toBeInTheDocument()
  })

  it('records normalized deduped recent searches', () => {
    window.localStorage.setItem(
      'brok:recent-searches',
      JSON.stringify([
        {
          id: 'old-1',
          query: 'compare cursor vs windsurf',
          mode: 'quick',
          createdAt: 1
        }
      ])
    )

    recordRecentSearch('  Compare Cursor vs Windsurf  ', 'search')

    const recents = JSON.parse(
      window.localStorage.getItem('brok:recent-searches') ?? '[]'
    )
    expect(recents).toHaveLength(1)
    expect(recents[0]).toMatchObject({
      query: 'Compare Cursor vs Windsurf',
      mode: 'search'
    })
  })

  it('normalizes invalid stored and recorded modes to quick', () => {
    const onSelect = vi.fn()
    window.localStorage.setItem(
      'brok:recent-searches',
      JSON.stringify([
        {
          id: 'recent-invalid',
          query: 'Explain stale mode handling',
          mode: 'banana',
          createdAt: Date.now()
        }
      ])
    )
    vi.mocked(window.localStorage.setItem).mockClear()

    render(<RecentSearches onSelect={onSelect} />)

    expect(screen.getByText('quick')).toBeInTheDocument()
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'brok:recent-searches',
      expect.stringContaining('"mode":"quick"')
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Explain stale mode handling/i })
    )
    expect(onSelect).toHaveBeenCalledWith(
      'Explain stale mode handling',
      'quick'
    )

    recordRecentSearch('Another invalid mode search', 'wat')

    const recents = JSON.parse(
      window.localStorage.getItem('brok:recent-searches') ?? '[]'
    )
    expect(recents[0]).toMatchObject({
      query: 'Another invalid mode search',
      mode: 'quick'
    })
  })
})
