import { beforeEach, describe, expect, test, vi } from 'vitest'

const { mockGetCurrentUserId, mockLoadMessage } = vi.hoisted(() => ({
  mockGetCurrentUserId: vi.fn(),
  mockLoadMessage: vi.fn()
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUserId: mockGetCurrentUserId
}))

vi.mock('@/lib/db/actions', () => ({
  loadMessage: mockLoadMessage
}))

import { GET } from '../[answerId]/follow-ups/route'

function routeParams(answerId: string) {
  return { params: Promise.resolve({ answerId }) }
}

describe('GET /api/answers/:answer_id/follow-ups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue('user_1')
  })

  test('returns follow-ups extracted from a stored assistant answer', async () => {
    mockLoadMessage.mockResolvedValue({
      id: 'answer_1',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: `Answer text.

\`\`\`spec
{"op":"add","path":"/root","value":"main"}
{"op":"add","path":"/elements/main","value":{"type":"Stack","props":{},"children":["q1"]}}
{"op":"add","path":"/elements/q1","value":{"type":"Button","props":{"text":"Design the Brok answer page UI","variant":"link","icon":"arrow-right"},"on":{"press":{"action":"submitQuery","params":{"query":"Design the Brok answer page UI"}}},"children":[]}}
\`\`\``
        }
      ]
    })

    const response = await GET(
      new Request('http://localhost/api/answers/answer_1/follow-ups') as any,
      routeParams('answer_1')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockLoadMessage).toHaveBeenCalledWith('answer_1', 'user_1')
    expect(body).toEqual({
      answer_id: 'answer_1',
      follow_ups: [
        {
          id: 'answer_1:follow_up:1',
          label: 'Design the Brok answer page UI',
          query: 'Design the Brok answer page UI',
          clicked: false
        }
      ]
    })
  })

  test('prefers durable metadata follow-ups when present', async () => {
    mockLoadMessage.mockResolvedValue({
      id: 'answer_2',
      role: 'assistant',
      metadata: {
        answer: {
          followUps: [
            {
              id: 'persisted_1',
              label: 'Compare source quality',
              query: 'Compare source quality'
            }
          ]
        }
      },
      parts: [
        {
          type: 'text',
          text: 'Answer text without a spec block.'
        }
      ]
    })

    const response = await GET(
      new Request('http://localhost/api/answers/answer_2/follow-ups') as any,
      routeParams('answer_2')
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.follow_ups).toEqual([
      {
        id: 'persisted_1',
        label: 'Compare source quality',
        query: 'Compare source quality',
        clicked: false
      }
    ])
  })

  test('returns 404 for missing or non-assistant answers', async () => {
    mockLoadMessage.mockResolvedValue({ id: 'message_1', role: 'user' })

    const response = await GET(
      new Request('http://localhost/api/answers/message_1/follow-ups') as any,
      routeParams('message_1')
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toMatchObject({
      type: 'not_found',
      code: 'answer_not_found'
    })
  })

  test('returns structured 503 when follow-ups cannot be loaded', async () => {
    mockLoadMessage.mockRejectedValue(new Error('database unavailable'))

    const response = await GET(
      new Request('http://localhost/api/answers/answer_1/follow-ups') as any,
      routeParams('answer_1')
    )
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toMatchObject({
      type: 'service_unavailable',
      code: 'follow_ups_unavailable'
    })
  })
})
