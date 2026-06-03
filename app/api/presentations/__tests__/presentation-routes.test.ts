import { NextRequest } from 'next/server'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireFeatureAccessForApi, mockWithOptionalRLS } = vi.hoisted(
  () => ({
    mockRequireFeatureAccessForApi: vi.fn(),
    mockWithOptionalRLS: vi.fn()
  })
)

vi.mock('@/lib/auth/app-access', () => ({
  requireFeatureAccessForApi: mockRequireFeatureAccessForApi
}))

vi.mock('@/lib/db/with-rls', () => ({
  withOptionalRLS: mockWithOptionalRLS
}))

function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

function jsonRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any
}

function selectQuery(result: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result)
  }
}

function shareToggleTx(existing: unknown, row: unknown) {
  const updateSet = vi.fn().mockReturnThis()
  const tx = {
    select: vi.fn(() => selectQuery(existing ? [existing] : [])),
    update: vi.fn(() => ({
      set: updateSet,
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(row ? [row] : [])
    }))
  }

  return { tx, updateSet }
}

describe('presentation API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireFeatureAccessForApi.mockResolvedValue({
      ok: true,
      user: { id: '11111111-1111-4111-8111-111111111111' }
    })
  })

  it('rejects anonymous non-UUID users before entering presentation RLS', async () => {
    mockRequireFeatureAccessForApi.mockResolvedValue({
      ok: true,
      user: { id: 'anonymous-user' }
    })

    const { GET } = await import('@/app/api/presentations/route')
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.message).toContain('real account')
    expect(mockRequireFeatureAccessForApi).toHaveBeenCalledWith('presentations')
    expect(mockWithOptionalRLS).not.toHaveBeenCalled()
  })

  it('revokes the share id when sharing is disabled', async () => {
    const { tx, updateSet } = shareToggleTx(
      { id: 'deck-id', isPublic: true, shareId: 'abcDEF1234' },
      { id: 'deck-id', isPublic: false, shareId: null }
    )
    mockWithOptionalRLS.mockImplementationOnce((_userId, callback) =>
      callback(tx)
    )

    const { POST } = await import('@/app/api/presentations/[id]/share/route')
    const response = await POST(
      jsonRequest('http://localhost/api/presentations/deck-id/share', {
        isPublic: false
      }),
      routeParams({ id: '22222222-2222-4222-8222-222222222222' })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: false, shareId: null })
    )
    expect(body).toMatchObject({
      isPublic: false,
      shareId: null,
      shareUrl: null
    })
  })

  it('loads public shared decks without requiring owner auth', async () => {
    const deck = {
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Shared Deck',
      isPublic: true,
      shareId: 'abcDEF1234'
    }
    const slides = [
      {
        id: '44444444-4444-4444-8444-444444444444',
        presentationId: deck.id,
        slideIndex: 0,
        title: 'Intro'
      }
    ]
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectQuery([deck]))
        .mockReturnValueOnce(selectQuery(slides))
    }
    mockWithOptionalRLS.mockImplementationOnce((_userId, callback) =>
      callback(tx)
    )

    const { GET } = await import(
      '@/app/api/presentations/share/[shareId]/route'
    )
    const response = await GET(
      new Request('http://localhost/api/presentations/share/abcDEF1234') as any,
      routeParams({ shareId: 'abcDEF1234' })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockWithOptionalRLS).toHaveBeenCalledWith(null, expect.any(Function))
    expect(body.presentation.title).toBe('Shared Deck')
    expect(body.slides).toHaveLength(1)
  })

  it('does not load disabled or missing share ids', async () => {
    const tx = {
      select: vi.fn().mockReturnValueOnce(selectQuery([]))
    }
    mockWithOptionalRLS.mockImplementationOnce((_userId, callback) =>
      callback(tx)
    )

    const { GET } = await import(
      '@/app/api/presentations/share/[shareId]/route'
    )
    const response = await GET(
      new Request('http://localhost/api/presentations/share/missing1') as any,
      routeParams({ shareId: 'missing1' })
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('presentation_not_found')
  })
})
