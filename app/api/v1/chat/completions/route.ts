import { NextRequest, NextResponse } from 'next/server'

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
import {
  calculateCost,
  routeToProvider,
  routeToProviderResponse
} from '@/lib/brok/provider-router'
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter'
import { runSearchPipeline } from '@/lib/brok/search-pipeline'
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
  const parsedBody = await readJsonBody<{
    model?: unknown
    messages?: unknown
    stream?: unknown
    temperature?: number
    max_tokens?: number
    max_completion_tokens?: number
    top_p?: number
    tools?: Array<{
      type: string
      function?: {
        name: string
        description?: string
        parameters?: Record<string, unknown>
      }
      web_search?: {
        top_n?: number
      }
    }>
    tool_choice?: {
      type: string
      web_search?: {
        top_n?: number
      }
    }
  }>(request)
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const body = parsedBody.body
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

  if (typeof modelId !== 'string') {
    return invalidRequestResponse('invalid_model', 'model must be a string.')
  }

  if (!Array.isArray(messages)) {
    return invalidRequestResponse(
      'missing_messages',
      'messages must be an array of chat messages.'
    )
  }
  const chatMessages = messages as Array<Record<string, unknown>>
  const shouldStream = stream === true

  // Validate model
  if (!isValidBrokModel(modelId)) {
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

  // Record rate limit check
  await recordRateLimitEvent(
    auth.apiKey.id,
    auth.workspace.id,
    'rpm',
    rateLimit.limit,
    rateLimit.current + 1,
    false
  )

  try {
    if (isWebSearchToolRequest(tools, tool_choice)) {
      const query = getLatestUserText(chatMessages)
      if (!query) {
        return invalidRequestResponse(
          'missing_query',
          'web_search tool requests require a user message.'
        )
      }

      const searchResult = await runSearchPipeline({
        query,
        depth: 'lite'
      })
      const latencyMs = Date.now() - startTime
      const inputTokens = searchResult.tokensUsed
      const outputTokens = Math.round(searchResult.answer.length / 4)

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
        providerCostUsd: 0,
        billedUsd: 0,
        latencyMs,
        status: 'success'
      })

      if (shouldStream) {
        return new Response(
          createSearchToolStream(requestId, modelId, searchResult.answer),
          {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Brok-Request-Id': requestId,
              ...brokRateLimitHeaders({
                limit: rateLimit.limit,
                current: rateLimit.current + 1,
                resetAt: rateLimit.resetAt
              })
            }
          }
        )
      }

      return NextResponse.json(
        {
          id: requestId,
          object: 'chat.completion',
          model: modelId,
          choices: [
            {
              message: {
                role: 'assistant',
                content: searchResult.answer
              },
              finish_reason: 'stop'
            }
          ],
          citations: searchResult.citations,
          follow_ups: searchResult.followUps,
          search_queries: searchResult.searchQueryList,
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens
          }
        },
        {
          headers: {
            'X-Brok-Request-Id': requestId,
            ...brokRateLimitHeaders({
              limit: rateLimit.limit,
              current: rateLimit.current + 1,
              resetAt: rateLimit.resetAt
            })
          }
        }
      )
    }

    if (shouldStream) {
      const providerResponse = await routeToProviderResponse(modelId, {
        model: modelId,
        messages: chatMessages,
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
            ...brokRateLimitHeaders({
              limit: rateLimit.limit,
              current: rateLimit.current + 1,
              resetAt: rateLimit.resetAt
            })
          }
        }
      )
    }

    // Route to provider
    const providerResponse = await routeToProvider(modelId, {
      model: modelId,
      messages: chatMessages,
      stream: shouldStream,
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
        ...brokRateLimitHeaders({
          limit: rateLimit.limit,
          current: rateLimit.current + 1,
          resetAt: rateLimit.resetAt
        })
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

function isWebSearchToolRequest(
  tools?: Array<{ type: string }>,
  toolChoice?: { type: string }
) {
  return (
    toolChoice?.type === 'web_search' ||
    tools?.some(tool => tool.type === 'web_search') === true
  )
}

function getLatestUserText(messages: Array<Record<string, unknown>>) {
  for (const message of messages.slice().reverse()) {
    if (message.role !== 'user') continue

    if (typeof message.content === 'string') {
      return message.content
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map(part => {
          if (!part || typeof part !== 'object') return ''
          const typed = part as { text?: unknown; content?: unknown }
          return typeof typed.text === 'string'
            ? typed.text
            : typeof typed.content === 'string'
              ? typed.content
              : ''
        })
        .filter(Boolean)
        .join('\n')
    }
  }

  return ''
}

function createSearchToolStream(
  requestId: string,
  modelId: string,
  answer: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: requestId,
            object: 'chat.completion.chunk',
            model: modelId,
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  content: answer
                },
                finish_reason: null
              }
            ],
            usage: null
          })}\n\n`
        )
      )
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: requestId,
            object: 'chat.completion.chunk',
            model: modelId,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop'
              }
            ],
            usage: null
          })}\n\n`
        )
      )
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    }
  })
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
