import { NextRequest, NextResponse } from 'next/server'

import { createChatWithFirstMessage } from '@/lib/actions/chat'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  apiKeyHasScope,
  forbiddenScopeResponse,
  unauthorizedResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import { brokRateLimitHeaders, readJsonBody } from '@/lib/brok/http'
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter'
import { validateSearchApiRequest } from '@/lib/brok/search-request-validation'
import {
  makeSearchThreadId,
  registerSearchStreamRequest
} from '@/lib/brok/search-stream-registry'
import { checkUsageLimits, usageLimitResponse } from '@/lib/brok/usage-tracker'
import { generateId } from '@/lib/db/schema'

import { POST as postSearchCompletion } from '@/app/api/v1/search/completions/route'

export const runtime = 'nodejs'

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
    return parsedBody.response
  }

  const body = parsedBody.body
  const validation = validateSearchApiRequest({
    body,
    allowedModels: auth.apiKey.allowedModels,
    allowModeDepthAliases: true
  })
  if (!validation.ok) {
    return validation.response
  }
  const {
    query,
    model,
    stream: shouldStream,
    depth,
    domains,
    recencyDays
  } = validation.value

  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')

  const forwardedBody = {
    model,
    query,
    depth,
    stream: shouldStream,
    recency_days: recencyDays,
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

  const usageLimit = await checkUsageLimits({
    apiKey: auth.apiKey,
    workspace: auth.workspace
  })
  if (!usageLimit.allowed) {
    return usageLimitResponse(usageLimit)
  }

  const rateLimit = await checkRateLimit(
    auth.apiKey.id,
    auth.workspace.id,
    auth.apiKey.rpmLimit ?? 60
  )

  if (!rateLimit.allowed) {
    if (rateLimit.reason === 'rate_limit_check_failed') {
      return NextResponse.json(
        {
          error: {
            type: 'service_unavailable',
            code: 'rate_limit_check_failed',
            message:
              'Rate limit check is temporarily unavailable. Please retry shortly.'
          }
        },
        { status: 503 }
      )
    }

    await recordRateLimitEvent(
      auth.apiKey.id,
      auth.workspace.id,
      'rpm',
      rateLimit.limit,
      rateLimit.current + 1,
      true
    )

    return NextResponse.json(
      {
        error: {
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
          message: 'Rate limit exceeded for this API key.',
          limit: `${rateLimit.limit} requests per minute`,
          retry_after_seconds: Math.ceil(
            (rateLimit.resetAt * 1000 - Date.now()) / 1000
          )
        }
      },
      {
        status: 429,
        headers: brokRateLimitHeaders({
          limit: rateLimit.limit,
          current: rateLimit.limit,
          resetAt: rateLimit.resetAt,
          includeRetryAfter: true
        })
      }
    )
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

  let messageId: string
  try {
    messageId = await registerSearchStreamRequest({
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
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          type: 'configuration_error',
          code: 'search_stream_registry_unavailable',
          message:
            error instanceof Error
              ? error.message
              : 'Search stream registry is unavailable.'
        }
      },
      { status: 503 }
    )
  }

  return NextResponse.json({
    thread_id: threadId,
    message_id: messageId,
    stream_url: `/api/search/stream/${messageId}`
  })
}
