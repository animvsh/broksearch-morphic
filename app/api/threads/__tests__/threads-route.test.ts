import { beforeEach, describe, expect, test, vi } from 'vitest'

const {
  mockGetCurrentUserId,
  mockLoadChatWithMessages,
  mockPostChat,
  mockUpdateChatVisibility
} = vi.hoisted(() => ({
  mockGetCurrentUserId: vi.fn(),
  mockLoadChatWithMessages: vi.fn(),
  mockPostChat: vi.fn(),
  mockUpdateChatVisibility: vi.fn()
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUserId: mockGetCurrentUserId
}))

vi.mock('@/lib/db/actions', () => ({
  loadChatWithMessages: mockLoadChatWithMessages,
  updateChatVisibility: mockUpdateChatVisibility
}))

vi.mock('@/app/api/chat/route', () => ({
  POST: mockPostChat
}))

vi.mock('@/lib/db/schema', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/schema')>()
  return {
    ...actual,
    generateId: () => 'msg_generated'
  }
})

import { POST as postThreadMessage } from '../[threadId]/messages/route'
import { GET as getThread } from '../[threadId]/route'
import { POST as saveThread } from '../[threadId]/save/route'

function routeParams(threadId: string) {
  return { params: Promise.resolve({ threadId }) }
}

function jsonRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }) as any
}

describe('thread API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue('user_1')
  })

  test('GET returns a thread with messages', async () => {
    const createdAt = new Date('2026-06-01T00:00:00.000Z')
    mockLoadChatWithMessages.mockResolvedValue({
      id: 'thread_1',
      title: 'Brok Architecture',
      userId: 'user_1',
      visibility: 'private',
      createdAt,
      messages: [
        {
          id: 'message_1',
          role: 'user',
          parts: [{ type: 'text', text: 'What is Brok?' }]
        }
      ]
    })

    const response = await getThread(
      new Request('http://localhost/api/threads/thread_1') as any,
      routeParams('thread_1')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockLoadChatWithMessages).toHaveBeenCalledWith('thread_1', 'user_1')
    expect(body).toMatchObject({
      thread_id: 'thread_1',
      title: 'Brok Architecture',
      visibility: 'private',
      user_id: 'user_1',
      messages: [
        {
          id: 'message_1',
          role: 'user'
        }
      ]
    })
  })

  test('GET returns 404 when the thread is unavailable to the user', async () => {
    mockLoadChatWithMessages.mockResolvedValue(null)

    const response = await getThread(
      new Request('http://localhost/api/threads/missing') as any,
      routeParams('missing')
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('thread_not_found')
  })

  test('GET returns structured 503 when the thread cannot be loaded', async () => {
    mockLoadChatWithMessages.mockRejectedValue(
      new Error('database unavailable')
    )

    const response = await getThread(
      new Request('http://localhost/api/threads/thread_1') as any,
      routeParams('thread_1')
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toMatchObject({
      type: 'service_unavailable',
      code: 'thread_unavailable'
    })
  })

  test('save defaults to private visibility', async () => {
    mockUpdateChatVisibility.mockResolvedValue({
      id: 'thread_1',
      visibility: 'private'
    })

    const response = await saveThread(
      jsonRequest('http://localhost/api/threads/thread_1/save', {}),
      routeParams('thread_1')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockUpdateChatVisibility).toHaveBeenCalledWith(
      'thread_1',
      'user_1',
      'private'
    )
    expect(body).toEqual({
      thread_id: 'thread_1',
      saved: true,
      visibility: 'private'
    })
  })

  test('save marks a thread as saved and returns visibility', async () => {
    mockUpdateChatVisibility.mockResolvedValue({
      id: 'thread_1',
      visibility: 'public'
    })

    const response = await saveThread(
      jsonRequest('http://localhost/api/threads/thread_1/save', {
        visibility: 'public'
      }),
      routeParams('thread_1')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockUpdateChatVisibility).toHaveBeenCalledWith(
      'thread_1',
      'user_1',
      'public'
    )
    expect(body).toEqual({
      thread_id: 'thread_1',
      saved: true,
      visibility: 'public'
    })
  })

  test('save requires authentication', async () => {
    mockGetCurrentUserId.mockResolvedValue(undefined)

    const response = await saveThread(
      jsonRequest('http://localhost/api/threads/thread_1/save', {}),
      routeParams('thread_1')
    )
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('authentication_required')
    expect(mockUpdateChatVisibility).not.toHaveBeenCalled()
  })

  test('save returns 404 when the thread is unavailable to the user', async () => {
    mockUpdateChatVisibility.mockResolvedValue(null)

    const response = await saveThread(
      jsonRequest('http://localhost/api/threads/thread_1/save', {}),
      routeParams('thread_1')
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('thread_not_found')
  })

  test('message continuation forwards to the chat stream route', async () => {
    mockPostChat.mockResolvedValue(
      new Response('stream', {
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    const response = await postThreadMessage(
      jsonRequest('http://localhost/api/threads/thread_1/messages', {
        content: 'now add follow-ups',
        mode: 'search'
      }),
      routeParams('thread_1')
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(mockPostChat).toHaveBeenCalledTimes(1)

    const forwardedRequest = mockPostChat.mock.calls[0][0] as Request
    await expect(forwardedRequest.json()).resolves.toMatchObject({
      chatId: 'thread_1',
      trigger: 'submit-message',
      isNewChat: false,
      mode: 'search',
      message: {
        id: 'msg_generated',
        role: 'user',
        parts: [{ type: 'text', text: 'now add follow-ups' }]
      }
    })
  })

  test('message continuation rejects empty content', async () => {
    const response = await postThreadMessage(
      jsonRequest('http://localhost/api/threads/thread_1/messages', {
        content: '   '
      }),
      routeParams('thread_1')
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('missing_content')
    expect(mockPostChat).not.toHaveBeenCalled()
  })
})
