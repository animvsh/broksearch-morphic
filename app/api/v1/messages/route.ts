import { NextRequest, NextResponse } from 'next/server'

import {
  validateAnthropicMessages,
  validateAnthropicSystem
} from '@/lib/brok/api-platform'
import {
  apiKeyHasScope,
  type AuthResult,
  verifyRequestAuth
} from '@/lib/brok/auth'
import {
  brokRateLimitHeaders,
  invalidRequestResponse,
  readJsonBody
} from '@/lib/brok/http'
import {
  beginIdempotentRequest,
  completeIdempotentRequest,
  idempotencyHeaders
} from '@/lib/brok/idempotency'
import { BROK_MODELS, isValidBrokModel } from '@/lib/brok/models'
import { applyBrokMarkup } from '@/lib/brok/pricing'
import {
  calculateCost,
  routeToProvider,
  routeToProviderResponse
} from '@/lib/brok/provider-router'
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter'
import {
  createOpenAiStreamUsageAccumulator,
  resolveStreamTokenUsage
} from '@/lib/brok/streaming-usage'
import {
  checkUsageLimits,
  generateRequestId,
  recordUsage,
  usageLimitResponse,
  UsageRecordError
} from '@/lib/brok/usage-tracker'
import { stripThinkingBlocks } from '@/lib/utils/strip-thinking-blocks'

export const runtime = 'nodejs'

type AnthropicContentBlock =
  | string
  | Array<{
      type: string
      text?: string
      content?: string
      name?: string
      input?: unknown
      id?: string
    }>

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: AnthropicContentBlock
}

function anthropicErrorResponse({
  code,
  type,
  message,
  status
}: {
  code?: string
  type: string
  message: string
  status: number
}) {
  return NextResponse.json(
    {
      type: 'error',
      error: {
        ...(code ? { code } : {}),
        type,
        message
      }
    },
    { status }
  )
}

function anthropicAuthErrorResponse(
  auth: Extract<AuthResult, { success: false }>
) {
  const errors: Record<
    Extract<AuthResult, { success: false }>['error'],
    { type: string; message: string }
  > = {
    missing_authorization: {
      type: 'authentication_error',
      message: 'Authorization Bearer token or x-api-key header is required.'
    },
    invalid_authorization_format: {
      type: 'authentication_error',
      message: 'Authorization header must be Bearer token.'
    },
    invalid_api_key: {
      type: 'authentication_error',
      message: 'Invalid API key.'
    },
    inactive_key: {
      type: 'permission_error',
      message: 'API key is inactive.'
    },
    workspace_inactive: {
      type: 'permission_error',
      message: 'Workspace is inactive.'
    },
    auth_storage_unavailable: {
      type: 'api_error',
      message:
        'API key storage is unavailable. Check the database connection and try again.'
    }
  }
  const error = errors[auth.error]
  return anthropicErrorResponse({
    code: auth.error,
    type: error.type,
    message: error.message,
    status: auth.status
  })
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = generateRequestId()
  const auth = await verifyRequestAuth(request)

  if (!auth.success) {
    return anthropicAuthErrorResponse(auth)
  }
  if (!apiKeyHasScope(auth.apiKey, 'code:write')) {
    return anthropicErrorResponse({
      type: 'permission_error',
      message: 'This API key requires the code:write scope.',
      status: 403
    })
  }

  const parsedBody = await readJsonBody<{
    model?: unknown
    stream?: unknown
    system?: AnthropicContentBlock
    messages?: unknown
    temperature?: number
    top_p?: number
    max_tokens?: number
  }>(request)
  if (!parsedBody.ok) {
    return parsedBody.response
  }

  const body = parsedBody.body
  const modelId = body.model ?? 'brok-code'
  if (body.stream !== undefined && typeof body.stream !== 'boolean') {
    return invalidRequestResponse('invalid_stream', 'stream must be a boolean.')
  }
  const shouldStream = body.stream === true

  if (typeof modelId !== 'string') {
    return invalidRequestResponse('invalid_model', 'model must be a string.')
  }

  if (!Array.isArray(body.messages)) {
    return invalidRequestResponse(
      'missing_messages',
      'messages must be an array of Anthropic messages.'
    )
  }
  const messageValidation = validateAnthropicMessages(body.messages)
  if (!messageValidation.ok) {
    return invalidRequestResponse(
      messageValidation.code,
      messageValidation.message
    )
  }
  const systemValidation = validateAnthropicSystem(body.system)
  if (!systemValidation.ok) {
    return invalidRequestResponse(
      systemValidation.code,
      systemValidation.message
    )
  }

  if (!isValidBrokModel(modelId)) {
    return NextResponse.json(
      {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: `Invalid model. Available: ${Object.keys(BROK_MODELS).join(', ')}`
        }
      },
      { status: 400 }
    )
  }

  const allowedModels = auth.apiKey.allowedModels as string[]
  if (allowedModels.length > 0 && !allowedModels.includes(modelId)) {
    return NextResponse.json(
      {
        type: 'error',
        error: {
          type: 'permission_error',
          message: `This API key does not have access to ${modelId}.`
        }
      },
      { status: 403 }
    )
  }

  const idempotency = await beginIdempotentRequest({
    request,
    workspaceId: auth.workspace.id,
    apiKeyId: auth.apiKey.id,
    route: '/api/v1/messages',
    body,
    stream: shouldStream
  })
  if (idempotency.kind === 'replay' || idempotency.kind === 'blocked') {
    return idempotency.response
  }

  const usageLimit = await checkUsageLimits({
    apiKey: auth.apiKey,
    workspace: auth.workspace
  })
  if (!usageLimit.allowed) {
    await completeIdempotentRequest({
      idempotency,
      requestId,
      status: 'failed'
    })
    return usageLimitResponse(usageLimit)
  }

  const rpmLimit = auth.apiKey.rpmLimit ?? 60
  const rateLimit = await checkRateLimit(
    auth.apiKey.id,
    auth.workspace.id,
    rpmLimit
  )

  if (!rateLimit.allowed) {
    if (rateLimit.reason === 'rate_limit_check_failed') {
      await completeIdempotentRequest({
        idempotency,
        requestId,
        status: 'failed'
      })
      return NextResponse.json(
        {
          type: 'error',
          error: {
            type: 'api_error',
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

    await completeIdempotentRequest({
      idempotency,
      requestId,
      status: 'failed'
    })
    return NextResponse.json(
      {
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded for this API key.'
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

  await recordRateLimitEvent(
    auth.apiKey.id,
    auth.workspace.id,
    'rpm',
    rateLimit.limit,
    rateLimit.current + 1,
    false
  )

  const anthropicMessages = body.messages as AnthropicMessage[]
  const providerMessages = toOpenAiMessages(body.system, anthropicMessages)

  try {
    if (shouldStream) {
      const providerResponse = await routeToProviderResponse(modelId, {
        model: modelId,
        messages: providerMessages,
        stream: true,
        temperature: body.temperature,
        topP: body.top_p,
        maxTokens: body.max_tokens
      })

      if (!providerResponse.body) {
        throw new Error('Brok stream did not include a response body')
      }

      return new Response(
        createAnthropicStream(providerResponse.body, requestId, modelId, {
          onComplete: async ({ content, usage }) => {
            const latencyMs = Date.now() - startTime
            const { inputTokens, outputTokens } = resolveStreamTokenUsage({
              usage,
              content,
              messages: providerMessages
            })
            const providerCost = await calculateCost(
              modelId,
              inputTokens,
              outputTokens
            )
            await recordUsage({
              requestId,
              workspaceId: auth.workspace.id,
              userId: auth.apiKey.userId,
              apiKeyId: auth.apiKey.id,
              endpoint: 'code',
              model: modelId,
              provider: 'Brok',
              inputTokens,
              outputTokens,
              providerCostUsd: providerCost,
              billedUsd: applyBrokMarkup(providerCost),
              latencyMs,
              status: 'success',
              metadata: {
                stream: true,
                usageSource: usage ? 'provider' : 'estimated'
              }
            })
            await completeIdempotentRequest({
              idempotency,
              requestId,
              status: 'completed'
            })
          },
          onAbort: async ({ content, usage }) => {
            const latencyMs = Date.now() - startTime
            const { inputTokens, outputTokens } = resolveStreamTokenUsage({
              usage,
              content,
              messages: providerMessages
            })
            const providerCost = await calculateCost(
              modelId,
              inputTokens,
              outputTokens
            )
            await recordUsage({
              requestId,
              workspaceId: auth.workspace.id,
              userId: auth.apiKey.userId,
              apiKeyId: auth.apiKey.id,
              endpoint: 'code',
              model: modelId,
              provider: 'Brok',
              inputTokens,
              outputTokens,
              providerCostUsd: providerCost,
              billedUsd: applyBrokMarkup(providerCost),
              latencyMs,
              status: 'aborted',
              metadata: {
                stream: true,
                usageSource: usage ? 'provider' : 'estimated',
                aborted: true
              }
            })
            await completeIdempotentRequest({
              idempotency,
              requestId,
              status: 'failed'
            })
          }
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Brok-Request-Id': requestId,
            ...idempotencyHeaders({
              key: idempotency.kind === 'reserved' ? idempotency.key : undefined
            }),
            ...brokRateLimitHeaders({
              limit: rateLimit.limit,
              current: rateLimit.current + 1,
              resetAt: rateLimit.resetAt
            })
          }
        }
      )
    }

    const providerResponse = await routeToProvider(modelId, {
      model: modelId,
      messages: providerMessages,
      stream: false,
      temperature: body.temperature,
      topP: body.top_p,
      maxTokens: body.max_tokens
    })

    const inputTokens = providerResponse.usage?.prompt_tokens || 0
    const outputTokens = providerResponse.usage?.completion_tokens || 0
    const providerCost = await calculateCost(modelId, inputTokens, outputTokens)
    const latencyMs = Date.now() - startTime

    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.apiKey.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'code',
      model: modelId,
      provider: 'Brok',
      inputTokens,
      outputTokens,
      providerCostUsd: providerCost,
      billedUsd: applyBrokMarkup(providerCost),
      latencyMs,
      status: 'success'
    })

    const text = stripThinkingBlocks(
      providerResponse.choices?.[0]?.message?.content ?? ''
    )

    const brokResponse = {
      id: requestId,
      type: 'message',
      role: 'assistant',
      model: modelId,
      content: [{ type: 'text', text }],
      stop_reason:
        providerResponse.choices?.[0]?.finish_reason === 'length'
          ? 'max_tokens'
          : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens
      }
    }
    const responseHeaders = {
      'X-Brok-Request-Id': requestId,
      ...idempotencyHeaders({
        key: idempotency.kind === 'reserved' ? idempotency.key : undefined
      }),
      ...brokRateLimitHeaders({
        limit: rateLimit.limit,
        current: rateLimit.current + 1,
        resetAt: rateLimit.resetAt
      })
    }
    await completeIdempotentRequest({
      idempotency,
      requestId,
      responseStatus: 200,
      responseBody: brokResponse,
      responseHeaders
    })

    return NextResponse.json(brokResponse, {
      headers: responseHeaders
    })
  } catch (error) {
    if (error instanceof UsageRecordError) {
      await completeIdempotentRequest({
        idempotency,
        requestId,
        status: 'failed'
      })
      return NextResponse.json(
        {
          type: 'error',
          error: {
            type: 'api_error',
            message:
              'Usage ledger storage is temporarily unavailable. Please retry shortly.'
          }
        },
        {
          status: 503,
          headers: {
            'X-Brok-Request-Id': requestId
          }
        }
      )
    }

    const latencyMs = Date.now() - startTime

    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.apiKey.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'code',
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
    await completeIdempotentRequest({
      idempotency,
      requestId,
      status: 'failed'
    })

    return NextResponse.json(
      {
        type: 'error',
        error: {
          type: 'api_error',
          message: 'Brok Code could not complete the request. Please try again.'
        }
      },
      { status: 500 }
    )
  }
}

function toOpenAiMessages(
  system: AnthropicContentBlock | undefined,
  messages: AnthropicMessage[]
) {
  const converted: Array<Record<string, unknown>> = []

  if (system) {
    converted.push({ role: 'system', content: contentToText(system) })
  }

  for (const message of messages) {
    converted.push({
      role: message.role,
      content: contentToText(message.content)
    })
  }

  return converted
}

function contentToText(content: AnthropicContentBlock): string {
  if (typeof content === 'string') return content

  return content
    .map(block => {
      if (block.type === 'text') return block.text ?? ''
      if (block.type === 'tool_result') return block.content ?? ''
      if (block.type === 'tool_use') {
        return `[tool_use:${block.name ?? block.id}] ${JSON.stringify(block.input ?? {})}`
      }
      return block.text ?? block.content ?? ''
    })
    .filter(Boolean)
    .join('\n')
}

function createAnthropicStream(
  providerBody: ReadableStream<Uint8Array>,
  requestId: string,
  modelId: string,
  options?: {
    onComplete?: (usage: { content: string; usage: unknown }) => Promise<void>
    onAbort?: (usage: { content: string; usage: unknown }) => Promise<void>
  }
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const reader = providerBody.getReader()
  const usageAccumulator = createOpenAiStreamUsageAccumulator()
  let buffer = ''
  let started = false
  let aborted = false

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          toAnthropicSse('message_start', {
            type: 'message_start',
            message: {
              id: requestId,
              type: 'message',
              role: 'assistant',
              model: modelId,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 }
            }
          })
        )
      )
      controller.enqueue(
        encoder.encode(
          toAnthropicSse('content_block_start', {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' }
          })
        )
      )
      started = true
    },
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          if (buffer.trim()) {
            usageAccumulator.trackSseLine(buffer)
            emitProviderLine(buffer, controller, encoder)
          }
          controller.enqueue(
            encoder.encode(
              toAnthropicSse('content_block_stop', {
                type: 'content_block_stop',
                index: 0
              })
            )
          )
          controller.enqueue(
            encoder.encode(
              toAnthropicSse('message_delta', {
                type: 'message_delta',
                delta: { stop_reason: 'end_turn', stop_sequence: null },
                usage: { output_tokens: 0 }
              })
            )
          )
          controller.enqueue(
            encoder.encode(
              toAnthropicSse('message_stop', { type: 'message_stop' })
            )
          )
          if (aborted) {
            await options?.onAbort?.(usageAccumulator.snapshot())
          } else {
            await options?.onComplete?.(usageAccumulator.snapshot())
          }
          controller.close()
          return
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''

        let emittedDelta = false
        for (const line of lines) {
          usageAccumulator.trackSseLine(line)
          if (emitProviderLine(line, controller, encoder)) {
            emittedDelta = true
          }
          if (emitProviderLine(line, controller, encoder)) {
            emittedDelta = true
          }
        }

        if (started && emittedDelta) {
          return
        }
      }
    },
    async cancel() {
      aborted = true
      try {
        await reader.cancel()
      } catch {
        // upstream may already be closed; ignore
      }
    }
  })
}

function emitProviderLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): boolean {
  if (!line.startsWith('data:')) return false

  const data = line.slice(5).trim()
  if (!data || data === '[DONE]') return false

  try {
    const payload = JSON.parse(data)
    const text =
      typeof payload.choices?.[0]?.delta?.content === 'string'
        ? stripThinkingBlocks(payload.choices[0].delta.content)
        : ''
    if (!text) return false

    controller.enqueue(
      encoder.encode(
        toAnthropicSse('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text }
        })
      )
    )
    return true
  } catch {
    return false
  }
}

function toAnthropicSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}
