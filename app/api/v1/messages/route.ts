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

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = generateRequestId()
  const auth = await verifyRequestAuth(request)

  if (!auth.success) {
    return unauthorizedResponse(auth)
  }
  if (!apiKeyHasScope(auth.apiKey, 'code:write')) {
    return forbiddenScopeResponse('code:write')
  }
  const usageLimit = await checkUsageLimits({
    apiKey: auth.apiKey,
    workspace: auth.workspace
  })
  if (!usageLimit.allowed) {
    return usageLimitResponse(usageLimit)
  }

  const body = await request.json()
  const modelId = body.model ?? 'brok-code'
  const stream = Boolean(body.stream)

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
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded for this API key.'
        }
      },
      { status: 429 }
    )
  }

  await recordRateLimitEvent(
    auth.apiKey.id,
    auth.workspace.id,
    'rpm',
    rateLimit.limit,
    rateLimit.current,
    false
  )

  const providerMessages = toOpenAiMessages(body.system, body.messages ?? [])

  try {
    if (stream) {
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
        status: 'success'
      })

      return new Response(
        createAnthropicStream(providerResponse.body, requestId, modelId),
        {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Brok-Request-Id': requestId
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
      billedUsd: providerCost * 1.5,
      latencyMs,
      status: 'success'
    })

    const text = stripThinkingBlocks(
      providerResponse.choices?.[0]?.message?.content ?? ''
    )

    return NextResponse.json(
      {
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
      },
      {
        headers: {
          'X-Brok-Request-Id': requestId
        }
      }
    )
  } catch (error) {
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
  modelId: string
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const reader = providerBody.getReader()
  let buffer = ''
  let started = false
  let index = 0

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
            emitProviderLine(buffer, controller, encoder, index)
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
          controller.close()
          return
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          index = emitProviderLine(line, controller, encoder, index)
        }

        if (started && lines.length > 0) {
          return
        }
      }
    },
    cancel() {
      return reader.cancel()
    }
  })
}

function emitProviderLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  index: number
) {
  if (!line.startsWith('data:')) return index

  const data = line.slice(5).trim()
  if (!data || data === '[DONE]') return index

  try {
    const payload = JSON.parse(data)
    const text =
      typeof payload.choices?.[0]?.delta?.content === 'string'
        ? stripThinkingBlocks(payload.choices[0].delta.content)
        : ''
    if (!text) return index

    controller.enqueue(
      encoder.encode(
        toAnthropicSse('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text }
        })
      )
    )
    return index + 1
  } catch {
    return index
  }
}

function toAnthropicSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}
