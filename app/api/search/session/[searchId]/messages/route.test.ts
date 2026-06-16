import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateChat, mockGetChat, mockGetCurrentUserId, mockUpsertMessage } =
  vi.hoisted(() => ({
    mockCreateChat: vi.fn(),
    mockGetChat: vi.fn(),
    mockGetCurrentUserId: vi.fn(),
    mockUpsertMessage: vi.fn()
  }))

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn()
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUserId: mockGetCurrentUserId
}))

vi.mock('@/lib/db/actions', () => ({
  createChat: mockCreateChat,
  getChat: mockGetChat,
  upsertMessage: mockUpsertMessage
}))

import { POST } from './route'

function routeParams(searchId: string) {
  return { params: Promise.resolve({ searchId }) }
}

function jsonRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/search/session/search_1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('search session message persistence route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue('user_1')
    mockGetChat.mockResolvedValue(null)
    mockCreateChat.mockResolvedValue({
      id: 'search_1',
      userId: 'user_1',
      title: 'What is Brok?',
      visibility: 'private'
    })
    mockUpsertMessage.mockResolvedValue({})
  })

  it('creates a private search chat and upserts deterministic messages', async () => {
    const response = await POST(
      jsonRequest({
        messages: [
          {
            id: 'search_1_user',
            role: 'user',
            parts: [{ type: 'text', text: 'What is Brok?' }]
          },
          {
            id: 'search_1_assistant',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Brok answers with sources. [1]' }],
            metadata: {
              answer: {
                citationCount: 1
              }
            }
          }
        ]
      }),
      routeParams('search_1')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockCreateChat).toHaveBeenCalledWith({
      id: 'search_1',
      title: 'What is Brok?',
      userId: 'user_1',
      visibility: 'private'
    })
    expect(mockUpsertMessage).toHaveBeenCalledTimes(2)
    expect(mockUpsertMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'search_1_user',
        chatId: 'search_1',
        role: 'user'
      }),
      'user_1'
    )
    expect(mockUpsertMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'search_1_assistant',
        chatId: 'search_1',
        role: 'assistant'
      }),
      'user_1'
    )
    expect(body).toEqual({
      search_id: 'search_1',
      saved: true,
      messages: 2
    })
  })

  it('updates an existing owned search chat without recreating it', async () => {
    mockGetChat.mockResolvedValue({
      id: 'search_1',
      userId: 'user_1',
      visibility: 'private'
    })

    const response = await POST(
      jsonRequest({
        messages: [
          {
            id: 'search_1_user',
            role: 'user',
            parts: [{ type: 'text', text: 'What is Brok?' }]
          }
        ]
      }),
      routeParams('search_1')
    )

    expect(response.status).toBe(200)
    expect(mockCreateChat).not.toHaveBeenCalled()
    expect(mockUpsertMessage).toHaveBeenCalledTimes(1)
  })

  it('requires authentication', async () => {
    mockGetCurrentUserId.mockResolvedValue(undefined)

    const response = await POST(
      jsonRequest({
        messages: [
          {
            id: 'search_1_user',
            role: 'user',
            parts: [{ type: 'text', text: 'What is Brok?' }]
          }
        ]
      }),
      routeParams('search_1')
    )
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('authentication_required')
    expect(mockCreateChat).not.toHaveBeenCalled()
    expect(mockUpsertMessage).not.toHaveBeenCalled()
  })

  it('rejects non-search ids', async () => {
    const response = await POST(
      jsonRequest({
        messages: [
          {
            id: 'message_1',
            role: 'user',
            parts: [{ type: 'text', text: 'What is Brok?' }]
          }
        ]
      }),
      routeParams('chat_1')
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('invalid_search_id')
    expect(mockCreateChat).not.toHaveBeenCalled()
  })

  it('rejects search sessions owned by another user', async () => {
    mockGetChat.mockResolvedValue({
      id: 'search_1',
      userId: 'user_2',
      visibility: 'public'
    })

    const response = await POST(
      jsonRequest({
        messages: [
          {
            id: 'search_1_user',
            role: 'user',
            parts: [{ type: 'text', text: 'What is Brok?' }]
          }
        ]
      }),
      routeParams('search_1')
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('search_session_forbidden')
    expect(mockUpsertMessage).not.toHaveBeenCalled()
  })
})
