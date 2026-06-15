import { NextRequest } from 'next/server'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { upsertMessage } from '@/lib/actions/chat'
import {
  getSearchStreamRequest,
  registerSearchStreamRequest
} from '@/lib/brok/search-stream-registry'

import { GET } from '../route'

const mockPostSearchCompletion = vi.fn()
const originalCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT
const originalUpstashUrl = process.env.UPSTASH_REDIS_REST_URL
const originalUpstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

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
    delete process.env.BROK_CLOUD_DEPLOYMENT
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    mockPostSearchCompletion.mockReset()
    lastPayload = null
    vi.mocked(upsertMessage).mockReset()
  })

  afterEach(() => {
    process.env.BROK_CLOUD_DEPLOYMENT = originalCloudDeployment
    process.env.UPSTASH_REDIS_REST_URL = originalUpstashUrl
    process.env.UPSTASH_REDIS_REST_TOKEN = originalUpstashToken
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
    const messageId = await registerSearchStreamRequest({
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

    const saved = await getSearchStreamRequest(messageId)
    expect(saved).toBeNull()
  })

  it('does not replay a consumed stream request', async () => {
    const messageId = await registerSearchStreamRequest({
      body: {
        query: 'single use stream',
        model: 'brok-search',
        stream: true,
        depth: 'standard',
        mode: 'search'
      },
      createdAt: Date.now(),
      headers: {}
    })

    mockPostSearchCompletion.mockImplementation(async () => {
      return new Response('event: done\ndata: {}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    })

    const first = await GET(
      new NextRequest('http://localhost/api/search/stream/msg_1'),
      {
        params: Promise.resolve({ messageId })
      }
    )
    await first.text()

    const replay = await GET(
      new NextRequest('http://localhost/api/search/stream/msg_1'),
      {
        params: Promise.resolve({ messageId })
      }
    )

    expect(first.status).toBe(200)
    expect(replay.status).toBe(404)
    expect(mockPostSearchCompletion).toHaveBeenCalledTimes(1)
  })

  it('persists assistant message after completion event', async () => {
    const messageId = await registerSearchStreamRequest({
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
      citations: [
        {
          id: 'src_1',
          title: 'Stored source',
          url: 'https://example.com/report?utm_source=brok',
          publisher: 'example.com',
          snippet: 'Stored source snippet',
          retrievedAt: '2026-06-01T00:00:00.000Z',
          qualityScore: 92
        }
      ],
      follow_ups: [
        {
          label: 'Stored follow-up',
          query: 'Stored follow-up'
        }
      ],
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
        parts: [{ type: 'text', text: 'Saved completion' }],
        metadata: {
          answer: {
            sources: [
              {
                title: 'Stored source',
                url: 'https://example.com/report?utm_source=brok',
                content: 'Stored source snippet',
                snippet: 'Stored source snippet',
                publisher: 'example.com',
                retrievedAt: '2026-06-01T00:00:00.000Z',
                publishedDate: '2026-06-01T00:00:00.000Z',
                date: '2026-06-01T00:00:00.000Z'
              }
            ],
            citationCount: 1,
            followUps: [
              {
                id: 'stream-follow-up-1',
                label: 'Stored follow-up',
                query: 'Stored follow-up'
              }
            ]
          }
        }
      },
      'user_1'
    )

    const saved = await getSearchStreamRequest(messageId)
    expect(saved).toBeNull()
  })

  it('persists source and follow-up events when completion metadata is sparse', async () => {
    const messageId = await registerSearchStreamRequest({
      body: {
        query: 'event metadata',
        model: 'brok-search',
        stream: true,
        depth: 'standard',
        mode: 'search'
      },
      createdAt: Date.now(),
      headers: {},
      thread: {
        id: 'thread_event_metadata',
        userId: 'user_2',
        userMessageId: 'msg_user_2'
      }
    })

    const sourceEvent = {
      id: 'req_3',
      source_id: 'src_2',
      citation_number: 1,
      title: 'Event source',
      url: 'https://example.com/event?utm_medium=stream#section',
      domain: 'example.com',
      snippet: 'Event source snippet',
      retrieved_at: '2026-06-02T00:00:00.000Z',
      quality_score: 88
    }
    const followUpsEvent = {
      id: 'req_3',
      items: [
        {
          label: 'Event follow-up',
          query: 'Event follow-up'
        }
      ]
    }
    const completionPayload = {
      id: 'req_3',
      object: 'search.completion',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Event saved completion'
          }
        }
      ]
    }

    mockPostSearchCompletion.mockImplementation(async () => {
      return new Response(
        `event: source\ndata: ${JSON.stringify(
          sourceEvent
        )}\n\nevent: follow_ups\ndata: ${JSON.stringify(
          followUpsEvent
        )}\n\nevent: search.completion\ndata: ${JSON.stringify(
          completionPayload
        )}\n\n`,
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
    await response.text()

    await new Promise(resolve => setTimeout(resolve, 50))
    expect(upsertMessage).toHaveBeenCalledWith(
      'thread_event_metadata',
      {
        id: expect.any(String),
        role: 'assistant',
        parts: [{ type: 'text', text: 'Event saved completion' }],
        metadata: {
          answer: {
            sources: [
              {
                title: 'Event source',
                url: 'https://example.com/event?utm_medium=stream#section',
                content: 'Event source snippet',
                snippet: 'Event source snippet',
                publisher: 'example.com',
                retrievedAt: '2026-06-02T00:00:00.000Z',
                publishedDate: '2026-06-02T00:00:00.000Z',
                date: '2026-06-02T00:00:00.000Z'
              }
            ],
            citationCount: 1,
            followUps: [
              {
                id: 'stream-follow-up-1',
                label: 'Event follow-up',
                query: 'Event follow-up'
              }
            ]
          }
        }
      },
      'user_2'
    )
  })

  it('does not persist when thread context is missing', async () => {
    const messageId = await registerSearchStreamRequest({
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
