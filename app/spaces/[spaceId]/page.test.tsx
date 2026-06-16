import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSpaceData: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  requireFeatureAccess: vi.fn()
}))

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect
}))

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccess: mocks.requireFeatureAccess
}))

vi.mock('@/lib/actions/platform-dashboard', () => ({
  getSpaceData: mocks.getSpaceData
}))

import SpaceDetailPage from './page'

const spaceId = '11111111-1111-4111-8111-111111111111'

describe('app/spaces/[spaceId]/page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireFeatureAccess.mockResolvedValue({ id: 'user-1' })
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`)
    })
    mocks.notFound.mockImplementation(() => {
      throw new Error('not-found')
    })
  })

  it('renders space context, projects, threads, members, and invites', async () => {
    mocks.getSpaceData.mockResolvedValue({
      space: {
        id: spaceId,
        slug: 'market-research',
        name: 'Market Research',
        description: 'Competitive research and source-backed notes.',
        ownerUserId: 'user-1',
        visibility: 'link',
        iconColor: '#0f766e',
        role: 'owner',
        memberCount: 2,
        threadCount: 1,
        projectCount: 1,
        presentationCount: 1,
        lastActivityAt: new Date('2026-06-15T12:00:00Z'),
        createdAt: new Date('2026-06-01T12:00:00Z'),
        updatedAt: new Date('2026-06-15T12:00:00Z')
      },
      members: [
        {
          id: 'member-1',
          userId: 'user-1',
          email: 'owner@example.com',
          displayName: 'Space owner',
          role: 'owner',
          lastActiveAt: new Date('2026-06-15T12:00:00Z'),
          invitedAt: new Date('2026-06-01T12:00:00Z'),
          acceptedAt: new Date('2026-06-01T12:00:00Z')
        },
        {
          id: 'member-2',
          userId: 'user-2',
          email: 'analyst@example.com',
          displayName: 'Analyst',
          role: 'editor',
          lastActiveAt: null,
          invitedAt: new Date('2026-06-02T12:00:00Z'),
          acceptedAt: new Date('2026-06-02T12:00:00Z')
        }
      ],
      projects: [
        {
          id: 'project-1',
          title: 'Pricing research',
          description: 'Track competitor packaging.',
          status: 'active',
          createdBy: 'user-1',
          createdAt: new Date('2026-06-10T12:00:00Z'),
          updatedAt: new Date('2026-06-15T12:00:00Z')
        }
      ],
      invites: [
        {
          id: 'invite-1',
          email: 'teammate@example.com',
          role: 'viewer',
          invitedBy: 'user-1',
          expiresAt: null,
          createdAt: new Date('2026-06-14T12:00:00Z')
        }
      ],
      recentThreads: [
        {
          id: 'thread-1',
          kind: 'thread',
          title: 'Who is moving upmarket?',
          summary: 'Sources on competitor enterprise motion.',
          href: '/search/thread-1',
          model: 'gpt-5',
          status: 'active',
          isPublic: false,
          useCount: 1,
          citeCount: 4,
          updatedAt: new Date('2026-06-15T12:00:00Z'),
          lastUsedAt: new Date('2026-06-15T12:00:00Z'),
          tags: []
        }
      ],
      totals: {
        members: 2,
        projects: 1,
        invites: 1,
        threads: 1
      }
    })

    render(
      await SpaceDetailPage({
        params: Promise.resolve({ spaceId })
      })
    )

    expect(mocks.getSpaceData).toHaveBeenCalledWith(spaceId)
    expect(
      screen.getByRole('heading', { name: 'Market Research' })
    ).toBeInTheDocument()
    expect(screen.getByText('Pricing research')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Who is moving upmarket/ })
    ).toHaveAttribute('href', '/search/thread-1')
    expect(screen.getByText('Analyst')).toBeInTheDocument()
    expect(screen.getByText('teammate@example.com')).toBeInTheDocument()
    expect(
      screen.getByText(/Invite and visibility management actions/)
    ).toBeInTheDocument()
  })

  it('redirects invalid space identifiers before loading data', async () => {
    await expect(
      SpaceDetailPage({
        params: Promise.resolve({ spaceId: 'not-a-space-id' })
      })
    ).rejects.toThrow('redirect:/spaces')

    expect(mocks.redirect).toHaveBeenCalledWith('/spaces')
    expect(mocks.getSpaceData).not.toHaveBeenCalled()
  })
})
