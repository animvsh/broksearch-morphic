import { NextRequest, NextResponse } from 'next/server'

import { createChatWithFirstMessage } from '@/lib/actions/chat'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import {
  apiKeyHasScope,
  forbiddenScopeResponse,
  unauthorizedResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import {
  brokRateLimitHeaders,
  invalidRequestResponse,
  readJsonBody
} from '@/lib/brok/http'
import { BROK_MODELS, isValidBrokModel } from '@/lib/brok/models'
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter'
import {
  makeSearchThreadId,
  registerSearchStreamRequest
} from '@/lib/brok/search-stream-registry'
import { checkUsageLimits, usageLimitResponse } from '@/lib/brok/usage-tracker'
import { generateId } from '@/lib/db/schema'

import { POST as postSearchCompletion } from '@/app/api/v1/search/completions/route'

export const runtime = 'nodejs'

type SearchDepth = 'lite' | 'standard' | 'deep'

function parseSearchDepth(
  value: unknown
):
  | { ok: true; depth: SearchDepth }
  | { ok: false; code: string; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, depth: 'standard' }
  }

  if (value === 'deep' || value === 'advanced') {
    return { ok: true, depth: 'deep' }
  }

  if (value === 'lite' || value === 'basic' || value === 'quick') {
    return { ok: true, depth: 'lite' }
  }

  if (value === 'standard') {
    return { ok: true, depth: 'standard' }
  }

  return {
    ok: false,
    code: 'invalid_search_depth',
    message:
      'search_depth must be one of lite, standard, deep, basic, quick, or advanced.'
  }
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
    return parsedBody.response
  }

  const body = parsedBody.body

  if (typeof body.query !== 'string' || !body.query.trim()) {
    return invalidRequestResponse(
      'missing_query',
      'query must be a non-empty string.'
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

  if (typeof model !== 'string') {
    return invalidRequestResponse('invalid_model', 'model must be a string.')
  }

  if (!isValidBrokModel(model) || !BROK_MODELS[model].supportsSearch) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'invalid_model',
          message:
            'Model does not support search. Use brok-search or brok-search-pro.'
        }
      },
      { status: 400 }
    )
  }

  const allowedModels = Array.isArray(auth.apiKey.allowedModels)
    ? (auth.apiKey.allowedModels as string[])
    : []
  if (allowedModels.length > 0 && !allowedModels.includes(model)) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'model_not_allowed',
          message: `This API key does not have access to ${model}.`
        }
      },
      { status: 403 }
    )
  }

  const depthInput =
    body.mode === 'deep' || body.mode === 'deep_search'
      ? 'deep'
      : body.mode === 'quick' || body.mode === 'lite'
        ? 'lite'
        : (body.depth ?? body.search_depth)
  const depthResult = parseSearchDepth(depthInput)
  if (!depthResult.ok) {
    return invalidRequestResponse(depthResult.code, depthResult.message)
  }
  const depth = depthResult.depth

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
