import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireFeatureAccess: vi.fn(),
  getDiscoverFeedData: vi.fn(),
  getDiscoverCategoryLabel: vi.fn((category: string) => {
    const labels: Record<string, string> = {
      ai_apps: 'AI apps',
      search: 'Search',
      code: 'Code',
      chat: 'Chat',
      presentations: 'Presentations'
    }
    return labels[category] ?? category
  }),
  getDiscoverCategoryOrder: vi.fn(() => [
    'ai_apps',
    'search',
    'code',
    'chat',
    'presentations'
  ])
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/lib/actions/platform-dashboard', () => ({
  getDiscoverFeedData: mocks.getDiscoverFeedData,
  getDiscoverCategoryLabel: mocks.getDiscoverCategoryLabel,
  getDiscoverCategoryOrder: mocks.getDiscoverCategoryOrder
}))

import DiscoverPage from './page'

const publishedAt = new Date('2026-06-15T12:00:00Z')

function makeFeedData() {
  const searchItem = {
    id: 'thread-1',
    kind: 'thread',
    category: 'search',
    title: 'How tariffs are changing EV supply chains',
    summary: 'A public research thread comparing filings and trade coverage.',
    authorName: 'Mina',
    authorHandle: 'mina',
    href: 'https://example.com/research/ev-supply-chains',
    thumbnailUrl: null,
    likeCount: 1250,
    saveCount: 42,
    shareCount: 9,
    viewCount: 4000,
    isFeatured: true,
    publishedAt
  }
  const codeItem = {
    id: 'project-1',
    kind: 'project',
    category: 'code',
    title: 'Agent evaluation harness',
    summary: 'A project for comparing coding-agent runs.',
    authorName: null,
    authorHandle: null,
    href: '/build/agent-eval',
    thumbnailUrl: null,
    likeCount: 8,
    saveCount: 3,
    shareCount: 1,
    viewCount: 20,
    isFeatured: false,
    publishedAt
  }

  return {
    featured: [searchItem],
    trending: [
      {
        id: 'trend-1',
        label: 'AI search quality benchmarks',
        category: 'search',
        velocity: 17,
        window: '24h',
        rank: 1
      }
    ],
    byCategory: {
      ai_apps: { label: 'AI apps', items: [] },
      search: { label: 'Search', items: [searchItem] },
      code: { label: 'Code', items: [codeItem] },
      chat: { label: 'Chat', items: [] },
      presentations: { label: 'Presentations', items: [] }
    },
    totals: {
      items: 2,
      likes: 1258,
      saves: 45
    }
  }
}

describe('DiscoverPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireFeatureAccess.mockResolvedValue({ id: 'user-1' })
    mocks.getDiscoverFeedData.mockResolvedValue(makeFeedData())
  })

  it('renders a search-first discover feed with source signals', async () => {
    render(
      await DiscoverPage({
        searchParams: Promise.resolve({})
      })
    )

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith(
      '/discover',
      'search'
    )
    expect(
      screen.getByRole('heading', { name: /research worth opening next/i })
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(/research a topic, company, paper/i)
    ).toHaveAttribute('name', 'q')
    expect(screen.getByDisplayValue('search')).toHaveAttribute('name', 'mode')
    expect(screen.getAllByText('example.com')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Public thread')[0]).toBeInTheDocument()
  })

  it('routes curated prompts and trending topics into search with q and mode', async () => {
    render(
      await DiscoverPage({
        searchParams: Promise.resolve({})
      })
    )

    expect(
      screen.getByRole('link', {
        name: /what changed in ai search quality this week/i
      })
    ).toHaveAttribute(
      'href',
      '/search?q=What+changed+in+AI+search+quality+this+week%3F&mode=search'
    )
    expect(
      screen.getByRole('link', {
        name: /ai search quality benchmarks/i
      })
    ).toHaveAttribute(
      'href',
      '/search?q=AI+search+quality+benchmarks&mode=search'
    )
  })

  it('filters category sections from the category query param', async () => {
    const feedData = makeFeedData()
    feedData.featured = []
    mocks.getDiscoverFeedData.mockResolvedValueOnce(feedData)

    render(
      await DiscoverPage({
        searchParams: Promise.resolve({ category: 'code' })
      })
    )

    expect(screen.getByText('Agent evaluation harness')).toBeInTheDocument()
    expect(
      screen.queryByText('How tariffs are changing EV supply chains')
    ).not.toBeInTheDocument()
  })
})
