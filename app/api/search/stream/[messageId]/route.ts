import { NextRequest } from 'next/server'

import { upsertMessage } from '@/lib/actions/chat'
import { getSearchStreamRequest } from '@/lib/brok/search-stream-registry'
import { generateId } from '@/lib/db/schema'

import { POST as postSearchCompletion } from '@/app/api/v1/search/completions/route'

export const runtime = 'nodejs'

type SearchCompletion = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

type SearchStreamThread = {
  id: string
  userId: string
}

type ParsedSseFrame = {
  event: string
  data: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params

  if (!messageId?.trim()) {
    return Response.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'missing_message_id',
          message: 'message_id is required.'
        }
      },
      { status: 400 }
    )
  }

  const storedRequest = getSearchStreamRequest(messageId)
  if (!storedRequest) {
    return Response.json(
      {
        error: {
          type: 'not_found',
          code: 'search_request_not_found',
          message: 'search stream request not found or expired.'
        }
      },
      { status: 404 }
    )
  }

  const headers = new Headers()
  headers.set('content-type', 'application/json')
  if (storedRequest.headers.xApiKey) {
    headers.set('x-api-key', storedRequest.headers.xApiKey)
  }
  if (storedRequest.headers.authorization) {
    headers.set('authorization', storedRequest.headers.authorization)
  }

  const forwarded = new NextRequest(
    new URL('/api/v1/search/completions', request.url),
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...storedRequest.body,
        stream: true
      })
    }
  )

  const response = await postSearchCompletion(forwarded)
  const thread = storedRequest.thread

  if (
    thread?.id &&
    thread?.userId &&
    response.body &&
    response.status === 200
  ) {
    return persistSearchStreamResponse(response, thread)
  }

  return response
}

function parseSseFrame(frame: string): ParsedSseFrame | null {
  const lines = frame.split(/\r?\n/)
  let event = 'message'
  const data: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).trimStart())
    }
  }

  if (data.length === 0) {
    return null
  }

  return {
    event,
    data: data.join('\n')
  }
}

function tryParseCompletionPayload(raw: string) {
  try {
    return JSON.parse(raw) as SearchCompletion
  } catch {
    return null
  }
}

function parseCompletionText(payload: SearchCompletion | null): string | null {
  return payload?.choices?.[0]?.message?.content ?? null
}

function readSearchStreamBody(
  response: Response,
  thread: SearchStreamThread
): Response {
  if (!response.body) {
    return response
  }

  const encoder = new TextEncoder()
  const reader = response.body.getReader()
  let completionText: string | null = null

  const body = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })

          let frameEnd = buffer.indexOf('\n\n')
          while (frameEnd !== -1) {
            const frame = buffer.slice(0, frameEnd)
            buffer = buffer.slice(frameEnd + 2)

            if (frame.trim()) {
              const parsed = parseSseFrame(frame)
              if (parsed?.event === 'search.completion') {
                completionText = parseCompletionText(
                  tryParseCompletionPayload(parsed.data)
                )
              }

              controller.enqueue(encoder.encode(frame + '\n\n'))
            }

            frameEnd = buffer.indexOf('\n\n')
          }
        }

        if (buffer.trim()) {
          const parsed = parseSseFrame(buffer)
          if (parsed?.event === 'search.completion') {
            completionText = parseCompletionText(
              tryParseCompletionPayload(parsed.data)
            )
          }

          controller.enqueue(encoder.encode(buffer))
        }
      } finally {
        controller.close()

        if (typeof completionText === 'string' && completionText.trim()) {
          void upsertMessage(
            thread.id,
            {
              id: generateId(),
              role: 'assistant',
              parts: [{ type: 'text', text: completionText }]
            },
            thread.userId
          ).catch(error => {
            if (process.env.NODE_ENV !== 'test') {
              console.error('Failed to persist search stream response:', error)
            }
          })
        }
      }
    }
  })

  const headers = new Headers(response.headers)
  headers.delete('content-length')

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

function persistSearchStreamResponse(
  response: Response,
  thread: SearchStreamThread
) {
  return readSearchStreamBody(response, thread)
}
