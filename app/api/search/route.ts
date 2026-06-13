import { NextRequest, NextResponse } from 'next/server'

import { createChatWithFirstMessage } from '@/lib/actions/chat'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  apiKeyHasScope,
  forbiddenScopeResponse,
  unauthorizedResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import { invalidRequestResponse, readJsonBody } from '@/lib/brok/http'
import {
  makeSearchThreadId,
  registerSearchStreamRequest
} from '@/lib/brok/search-stream-registry'
import { generateId } from '@/lib/db/schema'

import { POST as postSearchCompletion } from '@/app/api/v1/search/completions/route'

export const runtime = 'nodejs'

function normalizeSearchDepth(value: unknown) {
  if (value === 'deep' || value === 'advanced') return 'deep'
  if (value === 'lite' || value === 'basic' || value === 'quick') return 'lite'
  return 'standard'
}

export async function POST(request: NextRequest) {
  const auth = await verifyRequestAuth(request)
  if (!auth.success) {
    return unauthorizedResponse(auth)
  }
  if (!apiKeyHasScope(auth.apiKey, 'search:write')) {
    return forbiddenScopeResponse('search:write')
  }

  const parsedBody = await readJsonBody<{
    query?: unknown
    model?: unknown
    stream?: unknown
    mode?: unknown
    depth?: unknown
    search_depth?: unknown
    domains?: unknown
    recency_days?: unknown
    space_id?: unknown
  }>(request)

  if (!parsedBody.ok) {
    return NextResponse.json(
      { message: 'Invalid JSON payload' },
      { status: 400 }
    )
  }

  const body = parsedBody.body

  if (typeof body.query !== 'string' || !body.query.trim()) {
    return NextResponse.json(
      {
        message: 'Missing required field: query'
      },
      { status: 400 }
    )
  }

  const model =
    typeof body.model === 'string' && body.model.trim().length > 0
      ? body.model
      : 'brok-search'
  const query = body.query.trim()

  if (body.stream !== undefined && typeof body.stream !== 'boolean') {
    return invalidRequestResponse('invalid_stream', 'stream must be a boolean.')
  }

  const shouldStream = body.stream === false ? false : true

  const depth =
    body.mode === 'deep' || body.mode === 'deep_search'
      ? 'deep'
      : body.mode === 'quick' || body.mode === 'lite'
        ? 'lite'
        : normalizeSearchDepth(body.depth || body.search_depth)

  const domains =
    Array.isArray(body.domains) &&
    body.domains.every(domain => typeof domain === 'string')
      ? body.domains
      : undefined

  const recency_days =
    typeof body.recency_days === 'number' ? body.recency_days : undefined

  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')

  const forwardedBody = {
    model,
    query,
    depth,
    stream: shouldStream,
    recency_days,
    domains
  }

  if (!shouldStream) {
    const forwarded = new NextRequest(
      new URL('/api/v1/search/completions', request.url),
      {
        method: 'POST',
        headers,
        body: JSON.stringify(forwardedBody)
      }
    )

    return postSearchCompletion(forwarded)
  }

  const threadId = makeSearchThreadId()
  const userId =
    (await getCurrentUserId().catch(() => undefined)) ?? auth.apiKey.userId
  const userMessageId = generateId()
  let shouldPersistThread = false

  if (userId) {
    try {
      await createChatWithFirstMessage(
        threadId,
        {
          id: userMessageId,
          role: 'user',
          parts: [{ type: 'text', text: query }]
        },
        userId,
        query
      )

      shouldPersistThread = true
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('Failed to create search thread before stream:', error)
      }
    }
  }

  const messageId = registerSearchStreamRequest({
    thread:
      shouldPersistThread && userId
        ? {
            id: threadId,
            userId,
            userMessageId
          }
        : undefined,
    body: {
      ...forwardedBody,
      stream: true,
      mode:
        body.mode === 'deep'
          ? 'deep'
          : body.mode === 'quick'
            ? 'quick'
            : 'search'
    },
    createdAt: Date.now(),
    headers: {
      xApiKey: headers.get('x-api-key') ?? undefined,
      authorization: headers.get('authorization') ?? undefined
    }
  })

  return NextResponse.json({
    thread_id: threadId,
    message_id: messageId,
    stream_url: `/api/search/stream/${messageId}`
  })
}
