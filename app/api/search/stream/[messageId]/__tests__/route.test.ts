import { NextRequest } from 'next/server'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { upsertMessage } from '@/lib/actions/chat'
import {
  getSearchStreamRequest,
  registerSearchStreamRequest
} from '@/lib/brok/search-stream-registry'

import { GET } from '../route'

const mockPostSearchCompletion = vi.fn()

vi.mock('@/lib/actions/chat', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/actions/chat')>()
  return {
    ...actual,
    upsertMessage: vi.fn()
  }
})

vi.mock('@/app/api/v1/search/completions/route', () => ({
  POST: async (request: Request) => mockPostSearchCompletion(request)
}))

describe('GET /api/search/stream/[messageId]', () => {
  let lastPayload: Record<string, unknown> | null = null

  beforeEach(() => {
    mockPostSearchCompletion.mockReset()
    lastPayload = null
    vi.mocked(upsertMessage).mockReset()
  })

  it('returns 404 when stream request is missing', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/search/stream/msg_missing'),
      {
        params: Promise.resolve({ messageId: 'msg_missing' })
      }
    )

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body).toMatchObject({
      error: {
        code: 'search_request_not_found'
      }
    })
    expect(mockPostSearchCompletion).not.toHaveBeenCalled()
  })

  it('forwards saved stream request to v1 completions route with stream=true', async () => {
    const messageId = registerSearchStreamRequest({
      body: {
        query: 'Brok API streaming',
        model: 'brok-search',
        stream: true,
        depth: 'standard',
        mode: 'search'
      },
      createdAt: Date.now(),
      headers: {
        xApiKey: 'brok_sk_test_abc123',
        authorization: undefined
      }
    })

    mockPostSearchCompletion.mockImplementation(async (forwarded: Request) => {
      lastPayload = await forwarded.json()
      return new Response(
        `event: status\ndata: ${JSON.stringify(lastPayload)}\n\n`,
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        }
      )
    })

    const response = await GET(
      new NextRequest('http://localhost/api/search/stream/msg_1'),
      {
        params: Promise.resolve({ messageId })
      }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')

    expect(mockPostSearchCompletion).toHaveBeenCalledTimes(1)

    expect(lastPayload).toMatchObject({
      query: 'Brok API streaming',
      model: 'brok-search',
      stream: true,
      depth: 'standard'
    })

    const saved = getSearchStreamRequest(messageId)
    expect(saved).toBeTruthy()
  })

  it('persists assistant message after completion event', async () => {
    const messageId = registerSearchStreamRequest({
      body: {
        query: 'persisted answer',
        model: 'brok-search',
        stream: true,
        depth: 'standard',
        mode: 'search'
      },
      createdAt: Date.now(),
      headers: {},
      thread: {
        id: 'thread_persist',
        userId: 'user_1',
        userMessageId: 'msg_user_1'
      }
    })

    const completionPayload = {
      id: 'req_1',
      object: 'search.completion',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Saved completion'
          }
        }
      ]
    }

    mockPostSearchCompletion.mockImplementation(async () => {
      return new Response(
        `event: search.step\ndata: {"id":"req_1","message":"working"}\n\nevent: search.completion\ndata: ${JSON.stringify(
          completionPayload
        )}\n\nevent: done\ndata: {"id":"req_1","usage":{"total_tokens":10}}\n\n`,
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        }
      )
    })

    const response = await GET(
      new NextRequest('http://localhost/api/search/stream/msg_1'),
      {
        params: Promise.resolve({ messageId })
      }
    )
    const bodyText = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(bodyText).toContain('search.completion')

    await new Promise(resolve => setTimeout(resolve, 50))
    expect(upsertMessage).toHaveBeenCalledWith(
      'thread_persist',
      {
        id: expect.any(String),
        role: 'assistant',
        parts: [{ type: 'text', text: 'Saved completion' }]
      },
      'user_1'
    )

    const saved = getSearchStreamRequest(messageId)
    expect(saved).toBeTruthy()
  })

  it('does not persist when thread context is missing', async () => {
    const messageId = registerSearchStreamRequest({
      body: {
        query: 'no thread context',
        model: 'brok-search',
        stream: true,
        depth: 'standard',
        mode: 'search'
      },
      createdAt: Date.now(),
      headers: {}
    })

    mockPostSearchCompletion.mockImplementation(async () => {
      return new Response(
        `event: search.completion\ndata: ${JSON.stringify({
          id: 'req_2',
          object: 'search.completion',
          choices: [
            { message: { role: 'assistant', content: 'Missing context' } }
          ]
        })}\n\n`,
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        }
      )
    })

    const response = await GET(
      new NextRequest('http://localhost/api/search/stream/msg_1'),
      {
        params: Promise.resolve({ messageId })
      }
    )
    const bodyText = await response.text()

    expect(response.status).toBe(200)
    expect(bodyText).toContain('search.completion')
    expect(upsertMessage).not.toHaveBeenCalled()
  })
})
