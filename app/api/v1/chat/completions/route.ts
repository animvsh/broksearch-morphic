import { NextRequest, NextResponse } from 'next/server'

import {
  apiKeyHasScope,
  forbiddenScopeResponse,
  unauthorizedResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import { BROK_MODELS, isValidBrokModel } from '@/lib/brok/models'
import {
  calculateCost,
  routeToProvider,
  routeToProviderResponse
} from '@/lib/brok/provider-router'
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter'
import {
  checkUsageLimits,
  generateRequestId,
  recordUsage,
  usageLimitResponse
} from '@/lib/brok/usage-tracker'
import { stripThinkingBlocks } from '@/lib/utils/strip-thinking-blocks'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = generateRequestId()

  // Auth
  const auth = await verifyRequestAuth(request)
  if (!auth.success) {
    return unauthorizedResponse(auth)
  }
  if (!apiKeyHasScope(auth.apiKey, 'chat:write')) {
    return forbiddenScopeResponse('chat:write')
  }
  const usageLimit = await checkUsageLimits({
    apiKey: auth.apiKey,
    workspace: auth.workspace
  })
  if (!usageLimit.allowed) {
    return usageLimitResponse(usageLimit)
  }

  // Parse body
  const body = await request.json()
  const {
    model: modelId,
    messages,
    stream = false,
    temperature,
    max_tokens,
    max_completion_tokens,
    top_p,
    tools,
    tool_choice
  } = body

  // Validate model
  if (!modelId || !isValidBrokModel(modelId)) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'invalid_model',
          message: `Invalid model. Available: ${Object.keys(BROK_MODELS).join(', ')}`
        }
      },
      { status: 400 }
    )
  }

  // Check model is allowed for this key
  const allowedModels = auth.apiKey.allowedModels as string[]
  if (allowedModels.length > 0 && !allowedModels.includes(modelId)) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          code: 'model_not_allowed',
          message: `This API key does not have access to ${modelId}.`
        }
      },
      { status: 403 }
    )
  }

  // Check rate limit
  const rpmLimit = auth.apiKey.rpmLimit ?? 60
  const rateLimit = await checkRateLimit(
    auth.apiKey.id,
    auth.workspace.id,
    rpmLimit
  )

  if (!rateLimit.allowed) {
    await recordRateLimitEvent(
      auth.apiKey.id,
      auth.workspace.id,
      'rpm',
      rateLimit.limit,
      rateLimit.current,
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
        headers: {
          'X-Brok-RateLimit-Limit': String(rateLimit.limit),
          'X-Brok-RateLimit-Remaining': String(Math.max(0, rateLimit.current)),
          'X-Brok-RateLimit-Reset': String(rateLimit.resetAt),
          'Retry-After': String(
            Math.ceil((rateLimit.resetAt * 1000 - Date.now()) / 1000)
          )
        }
      }
    )
  }

  // Record rate limit check
  await recordRateLimitEvent(
    auth.apiKey.id,
    auth.workspace.id,
    'rpm',
    rateLimit.limit,
    rateLimit.current,
    false
  )

  try {
    if (stream) {
      const providerResponse = await routeToProviderResponse(modelId, {
        model: modelId,
        messages,
        stream: true,
        temperature,
        topP: top_p,
        maxTokens: max_tokens ?? max_completion_tokens,
        tools,
        toolChoice: tool_choice
      })

      if (!providerResponse.body) {
        throw new Error('Brok stream did not include a response body')
      }

      const latencyMs = Date.now() - startTime

      await recordUsage({
        requestId,
        workspaceId: auth.workspace.id,
        userId: auth.apiKey.userId,
        apiKeyId: auth.apiKey.id,
        endpoint: 'chat',
        model: modelId,
        provider: 'Brok',
        inputTokens: 0,
        outputTokens: 0,
        providerCostUsd: 0,
        billedUsd: 0,
        latencyMs,
        status: 'success'
      })

      return new Response(
        createBrokStream(providerResponse.body, requestId, modelId),
        {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Brok-Request-Id': requestId,
            'X-Brok-RateLimit-Limit': String(rateLimit.limit),
            'X-Brok-RateLimit-Remaining': String(
              Math.max(0, rateLimit.limit - rateLimit.current - 1)
            ),
            'X-Brok-RateLimit-Reset': String(rateLimit.resetAt)
          }
        }
      )
    }

    // Route to provider
    const providerResponse = await routeToProvider(modelId, {
      model: modelId,
      messages,
      stream,
      temperature,
      topP: top_p,
      maxTokens: max_tokens ?? max_completion_tokens,
      tools,
      toolChoice: tool_choice
    })

    const latencyMs = Date.now() - startTime

    // Calculate costs
    const inputTokens = providerResponse.usage?.prompt_tokens || 0
    const outputTokens = providerResponse.usage?.completion_tokens || 0
    const providerCost = await calculateCost(modelId, inputTokens, outputTokens)
    const markup = 1.5 // 50% markup
    const billedAmount = providerCost * markup

    // Record usage
    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.apiKey.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'chat',
      model: modelId,
      provider: 'Brok',
      inputTokens,
      outputTokens,
      providerCostUsd: providerCost,
      billedUsd: billedAmount,
      latencyMs,
      status: 'success'
    })

    // Transform response to Brok format
    const brokResponse = {
      id: requestId,
      object: 'chat.completion',
      model: modelId,
      choices: providerResponse.choices.map(choice => ({
        ...choice,
        message: {
          role: choice.message.role,
          content:
            typeof choice.message.content === 'string'
              ? stripThinkingBlocks(choice.message.content)
              : choice.message.content,
          ...(choice.message.tool_calls
            ? { tool_calls: choice.message.tool_calls }
            : {})
        }
      })),
      usage: providerResponse.usage
    }

    return NextResponse.json(brokResponse, {
      headers: {
        'X-Brok-Request-Id': requestId,
        'X-Brok-RateLimit-Limit': String(rateLimit.limit),
        'X-Brok-RateLimit-Remaining': String(
          Math.max(0, rateLimit.limit - rateLimit.current - 1)
        ),
        'X-Brok-RateLimit-Reset': String(rateLimit.resetAt)
      }
    })
  } catch (error) {
    const latencyMs = Date.now() - startTime

    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.apiKey.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'chat',
      model: modelId,
      provider: 'Brok',
      inputTokens: 0,
      outputTokens: 0,
      providerCostUsd: 0,
      billedUsd: 0,
      latencyMs,
      status: 'error',
      errorCode: error instanceof Error ? error.message : 'unknown_error'
    })

    return NextResponse.json(
      {
        error: {
          type: 'internal_error',
          code: 'provider_error',
          message: 'Brok could not complete the request. Please try again.'
        }
      },
      { status: 500 }
    )
  }
}

function createBrokStream(
  providerBody: ReadableStream<Uint8Array>,
  requestId: string,
  modelId: string
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const reader = providerBody.getReader()
  const sanitizer = createStreamSanitizer()
  let buffer = ''

  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          if (buffer.trim()) {
            controller.enqueue(
              encoder.encode(
                formatSseLine(buffer, requestId, modelId, sanitizer)
              )
            )
          }
          controller.close()
          return
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          controller.enqueue(
            encoder.encode(formatSseLine(line, requestId, modelId, sanitizer))
          )
        }

        if (lines.length > 0) {
          return
        }
      }
    },
    cancel() {
      return reader.cancel()
    }
  })
}

function formatSseLine(
  line: string,
  requestId: string,
  modelId: string,
  sanitizer: ReturnType<typeof createStreamSanitizer>
): string {
  if (!line.startsWith('data:')) {
    return `${line}\n`
  }

  const data = line.slice(5).trim()

  if (!data || data === '[DONE]') {
    return `${line}\n`
  }

  try {
    const payload = JSON.parse(data)
    return `data: ${JSON.stringify(toBrokStreamPayload(payload, requestId, modelId, sanitizer))}\n`
  } catch {
    return `${line}\n`
  }
}

function createStreamSanitizer() {
  let suppressUntilThinkClose = false
  let emittedUserFacingContent = false

  return function sanitizeContent(content: string) {
    let next = content

    if (suppressUntilThinkClose) {
      const closingIndex = next.toLowerCase().indexOf('</think>')
      if (closingIndex === -1) {
        return ''
      }
      suppressUntilThinkClose = false
      next = next.slice(closingIndex + '</think>'.length)
    }

    if (next.toLowerCase().includes('<think>')) {
      const closingIndex = next.toLowerCase().indexOf('</think>')
      if (closingIndex === -1) {
        suppressUntilThinkClose = true
        return ''
      }
      next = next.slice(closingIndex + '</think>'.length)
    }

    if (
      !emittedUserFacingContent &&
      (next.toLowerCase().includes('</think>') || looksLikeReasoningLeak(next))
    ) {
      const closingIndex = next.toLowerCase().indexOf('</think>')
      if (closingIndex === -1) {
        suppressUntilThinkClose = true
        return ''
      }
      next = next.slice(closingIndex + '</think>'.length)
    }

    const sanitized = stripThinkingBlocks(next)
    if (sanitized.trim()) {
      emittedUserFacingContent = true
    }
    return sanitized
  }
}

function looksLikeReasoningLeak(content: string) {
  const normalized = content.trim().toLowerCase()
  return [
    'the user wants',
    'we need',
    'i need',
    'i should',
    'need answer',
    'simple request'
  ].some(prefix => normalized.startsWith(prefix))
}

function toBrokStreamPayload(
  payload: Record<string, unknown>,
  requestId: string,
  modelId: string,
  sanitizer: ReturnType<typeof createStreamSanitizer>
) {
  return {
    id: requestId,
    object: payload.object ?? 'chat.completion.chunk',
    created: payload.created,
    model: modelId,
    choices: Array.isArray(payload.choices)
      ? payload.choices.map(choice => sanitizeStreamChoice(choice, sanitizer))
      : payload.choices,
    usage: payload.usage ?? null
  }
}

function sanitizeStreamChoice(
  choice: unknown,
  sanitizeContent: ReturnType<typeof createStreamSanitizer>
) {
  if (!choice || typeof choice !== 'object') {
    return choice
  }

  const typedChoice = choice as {
    index?: number
    finish_reason?: string | null
    delta?: {
      role?: string
      content?: string
      tool_calls?: unknown
    }
  }

  return {
    index: typedChoice.index,
    finish_reason: typedChoice.finish_reason,
    delta: {
      ...(typedChoice.delta?.role ? { role: typedChoice.delta.role } : {}),
      ...(typedChoice.delta?.content
        ? { content: sanitizeContent(typedChoice.delta.content) }
        : {}),
      ...(typedChoice.delta?.tool_calls
        ? { tool_calls: typedChoice.delta.tool_calls }
        : {})
    }
  }
}
