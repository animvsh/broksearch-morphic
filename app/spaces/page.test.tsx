import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listSpaces: vi.fn(),
  redirect: vi.fn(),
  requireFeatureAccess: vi.fn()
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/lib/actions/platform-dashboard', () => ({
  listSpaces: mocks.listSpaces
}))

import SpacesPage from './page'

describe('app/spaces/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireFeatureAccess.mockResolvedValue({ id: 'user-1' })
  })

  it('renders actionable space cards from membership data', async () => {
    mocks.listSpaces.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'market-research',
        name: 'Market Research',
        description: 'Competitive research and source-backed notes.',
        ownerUserId: 'user-1',
        visibility: 'private',
        iconColor: '#0f766e',
        role: 'owner',
        memberCount: 3,
        threadCount: 4,
        projectCount: 2,
        presentationCount: 1,
        lastActivityAt: new Date('2026-06-15T12:00:00Z'),
        createdAt: new Date('2026-06-01T12:00:00Z'),
        updatedAt: new Date('2026-06-15T12:00:00Z')
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'api-platform',
        name: 'API Platform',
        description: null,
        ownerUserId: 'user-2',
        visibility: 'link',
        iconColor: null,
        role: 'viewer',
        memberCount: 5,
        threadCount: 0,
        projectCount: 0,
        presentationCount: 0,
        lastActivityAt: new Date('2026-06-14T12:00:00Z'),
        createdAt: new Date('2026-06-01T12:00:00Z'),
        updatedAt: new Date('2026-06-14T12:00:00Z')
      }
    ])

    render(await SpacesPage())

    expect(mocks.requireFeatureAccess).toHaveBeenCalledWith('/spaces', 'search')
    expect(
      screen.getByRole('heading', { name: 'Team research spaces' })
    ).toBeInTheDocument()
    expect(screen.getByText('Market Research')).toBeInTheDocument()
    expect(screen.getByLabelText('Open Market Research')).toHaveAttribute(
      'href',
      '/spaces/11111111-1111-4111-8111-111111111111'
    )
    expect(screen.getByText('7 saved items')).toBeInTheDocument()
    expect(screen.getByText('Ready for saved work')).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: /Start search/ })[0]
    ).toHaveAttribute('href', '/search')
  })

  it('renders a useful zero state when no spaces exist', async () => {
    mocks.listSpaces.mockResolvedValue([])

    render(await SpacesPage())

    expect(
      screen.getByRole('heading', { name: 'No spaces yet' })
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: /Start search/ })[0]
    ).toHaveAttribute('href', '/search')
    expect(
      screen.getAllByRole('link', { name: /Open library|Library/ })[0]
    ).toHaveAttribute('href', '/library')
  })
})
