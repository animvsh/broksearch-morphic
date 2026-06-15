import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireFeatureAccess: vi.fn(),
  getLibraryData: vi.fn(),
  getLibraryKindLabel: vi.fn((kind: string) => {
    const labels: Record<string, string> = {
      search: 'Search',
      chat: 'Chat',
      project: 'App project',
      presentation: 'Presentation',
      api_session: 'API session'
    }
    return labels[kind] ?? kind
  }),
  getLibraryKindOrder: vi.fn(() => [
    'search',
    'chat',
    'project',
    'presentation',
    'api_session'
  ]),
  getLibrarySortLabel: vi.fn((sort: string) => {
    const labels: Record<string, string> = {
      recent: 'Most recent',
      most_used: 'Most used',
      most_cited: 'Most cited'
    }
    return labels[sort] ?? sort
  })
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/lib/actions/platform-dashboard', () => ({
  getLibraryData: mocks.getLibraryData,
  getLibraryKindLabel: mocks.getLibraryKindLabel,
  getLibraryKindOrder: mocks.getLibraryKindOrder,
  getLibrarySortLabel: mocks.getLibrarySortLabel
}))

import LibraryPage from './page'

const emptyTotals = {
  items: 0,
  archived: 0,
  public: 0,
  byKind: {
    search: 0,
    chat: 0,
    project: 0,
    presentation: 0,
    api_session: 0
  }
}

describe('app/library/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireFeatureAccess.mockResolvedValue({})
  })

  it('renders an actionable empty library state without fake saved data', async () => {
    mocks.getLibraryData.mockResolvedValue({
      items: [],
      tags: [],
      totals: emptyTotals
    })

    render(await LibraryPage({ searchParams: Promise.resolve({}) }))

    expect(
      screen.getByRole('heading', { name: /your library is empty/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /start a new search/i })
    ).toHaveAttribute('href', '/search')
    expect(
      screen.queryByText(/saved intelligence, ready to reuse/i)
    ).toBeInTheDocument()
  })

  it('surfaces saved answer metadata and fast follow-up actions', async () => {
    mocks.getLibraryData.mockResolvedValue({
      items: [
        {
          id: 'item-1',
          kind: 'search',
          title: 'What changed in AI search?',
          summary:
            'Answer engines now combine retrieval, citations, and task context.',
          href: '/search/thread-1',
          model: 'brok-fast',
          status: 'active',
          isPublic: true,
          useCount: 3,
          citeCount: 4,
          tags: ['market'],
          updatedAt: new Date('2026-06-15T12:00:00.000Z'),
          lastUsedAt: new Date('2026-06-15T12:00:00.000Z')
        }
      ],
      tags: [{ id: 'tag-1', name: 'market', color: null, count: 1 }],
      totals: {
        ...emptyTotals,
        items: 1,
        public: 1,
        byKind: { ...emptyTotals.byKind, search: 1 }
      }
    })

    render(
      await LibraryPage({
        searchParams: Promise.resolve({ view: 'grid' })
      })
    )

    expect(
      screen.getByRole('link', { name: /what changed in ai search/i })
    ).toHaveAttribute('href', '/search/thread-1')
    expect(screen.getByText(/4 sources cited/i)).toBeInTheDocument()
    expect(screen.getByText(/brok-fast/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /ask follow-up/i })
    ).toHaveAttribute('href', '/search?q=What%20changed%20in%20AI%20search%3F')
  })
})
