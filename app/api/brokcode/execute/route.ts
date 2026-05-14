import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  apiKeyHasScope,
  AuthResult,
  forbiddenScopeResponse,
  unauthorizedResponse,
  verifyRequestAuth
} from '@/lib/brok/auth'
import { BrokModelId } from '@/lib/brok/models'
import { routeToProviderResponse } from '@/lib/brok/provider-router'
import {
  checkUsageLimits,
  generateRequestId,
  recordUsage,
  usageLimitResponse
} from '@/lib/brok/usage-tracker'
import { enforceBrokCodeAccountOwnership } from '@/lib/brokcode/account-guard'
import {
  decryptRuntimeKey,
  getLatestSavedBrokCodeRuntimeKeyForUser
} from '@/lib/brokcode/key-vault'
import {
  isDeepSecSecurityScanCommand,
  runDeepSecSecurityScan
} from '@/lib/brokcode/security-scan'
import { runPiAgentPrompt } from '@/lib/pi/coding-agent'
import {
  createBackgroundTask,
  updateBackgroundTask
} from '@/lib/tasks/background-tasks'
import { stripThinkingBlocks } from '@/lib/utils/strip-thinking-blocks'

export const runtime = 'nodejs'
export const maxDuration = 300

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

type SuccessfulAuth = Extract<AuthResult, { success: true }>

const DEFAULT_BROKCODE_MODEL = 'brok-code'

function resolveBrokCodeModel(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  return (
    process.env.BROKCODE_DEFAULT_MODEL?.trim() ||
    process.env.BROK_MODEL?.trim() ||
    DEFAULT_BROKCODE_MODEL
  )
}

function buildOpenCodeEndpoint(rawBase: string) {
  const base = rawBase.trim().replace(/\/$/, '')

  if (base.endsWith('/v1/chat/completions')) {
    return base
  }

  if (base.endsWith('/v1')) {
    return `${base}/chat/completions`
  }

  return `${base}/v1/chat/completions`
}

function isSelfBrokApiEndpoint(
  rawBase: string | undefined,
  requestUrl: string
) {
  if (!rawBase) return false

  try {
    const base = new URL(rawBase)
    const current = new URL(requestUrl)
    const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])
    const sameOrigin =
      base.origin === current.origin ||
      (localHosts.has(base.hostname) &&
        localHosts.has(current.hostname) &&
        base.port === current.port)
    return sameOrigin && base.pathname.startsWith('/api/v1')
  } catch {
    return false
  }
}

function extractBearerToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7).trim() || null
}

function extractAssistantText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content.trim()
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (typeof part?.text === 'string') return part.text
        return ''
      })
      .join('\n')
      .trim()
  }
  return ''
}

function extractPreviewUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i)
  if (!match?.[0]) {
    return null
  }

  // Drop trailing punctuation from plain-language sentences.
  return match[0].replace(/[),.;:!?]+$/, '')
}

function formatSseEvent(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

function getDeltaText(payload: any): string {
  const choice = payload?.choices?.[0]
  const delta = choice?.delta?.content
  if (typeof delta === 'string') return delta

  const messageContent = choice?.message?.content
  if (typeof messageContent === 'string') return messageContent

  if (Array.isArray(delta)) {
    return delta
      .map(part => {
        if (typeof part === 'string') return part
        if (typeof part?.text === 'string') return part.text
        return ''
      })
      .join('')
  }

  return ''
}

function estimateTokensFromText(text: string) {
  return Math.max(0, Math.ceil(text.length / 4))
}

function estimateInputTokens(messages: OpenAiMessage[]) {
  return estimateTokensFromText(
    messages.map(message => message.content).join('\n')
  )
}

function usageNumber(usage: unknown, keys: string[]) {
  if (!usage || typeof usage !== 'object') return 0

  for (const key of keys) {
    const value = (usage as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }

  return 0
}

async function recordCodeExecutionUsage({
  auth,
  requestId,
  startTime,
  model,
  provider,
  messages,
  content,
  usage,
  status,
  errorCode,
  toolCalls
}: {
  auth: SuccessfulAuth
  requestId: string
  startTime: number
  model: string
  provider: string
  messages: OpenAiMessage[]
  content?: string
  usage?: unknown
  status: 'success' | 'error'
  errorCode?: string
  toolCalls?: number
}) {
  const inputTokens =
    usageNumber(usage, ['prompt_tokens', 'input_tokens']) ||
    estimateInputTokens(messages)
  const outputTokens =
    usageNumber(usage, ['completion_tokens', 'output_tokens']) ||
    estimateTokensFromText(content ?? '')

  await recordUsage({
    requestId,
    workspaceId: auth.workspace.id,
    userId: auth.apiKey.userId,
    apiKeyId: auth.apiKey.id,
    endpoint: 'code',
    model,
    provider,
    inputTokens,
    outputTokens,
    toolCalls: toolCalls ?? 0,
    providerCostUsd: 0,
    billedUsd: 0,
    latencyMs: Date.now() - startTime,
    status,
    errorCode
  })
}

async function forwardOpenAiCompatibleStream({
  providerBody,
  send
}: {
  providerBody: ReadableStream<Uint8Array>
  send: (event: string, payload: unknown) => void
}) {
  const decoder = new TextDecoder()
  const reader = providerBody.getReader()
  let buffer = ''
  let content = ''
  let visibleContent = ''
  let usage: unknown = null

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue

      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue

      try {
        const payload = JSON.parse(data)
        const delta = getDeltaText(payload)
        if (delta) {
          content += delta
          const stripped = stripThinkingBlocks(content).trimStart()
          const visibleDelta = stripped.slice(visibleContent.length)
          if (visibleDelta) {
            visibleContent = stripped
            send('delta', { content: visibleDelta })
          }
        }
        if (payload?.usage) {
          usage = payload.usage
        }
      } catch {}
    }
  }

  if (buffer.trim().startsWith('data:')) {
    const data = buffer.trim().slice(5).trim()
    if (data && data !== '[DONE]') {
      try {
        const payload = JSON.parse(data)
        const delta = getDeltaText(payload)
        if (delta) {
          content += delta
          const stripped = stripThinkingBlocks(content).trimStart()
          const visibleDelta = stripped.slice(visibleContent.length)
          if (visibleDelta) {
            visibleContent = stripped
            send('delta', { content: visibleDelta })
          }
        }
        if (payload?.usage) {
          usage = payload.usage
        }
      } catch {}
    }
  }

  return { content: visibleContent || stripThinkingBlocks(content), usage }
}

async function runDirectBrokRuntime({
  model,
  messages,
  stream,
  send
}: {
  model: string
  messages: OpenAiMessage[]
  stream: boolean
  send?: (event: string, payload: unknown) => void
}) {
  const providerResponse = await routeToProviderResponse(model as BrokModelId, {
    model,
    messages,
    stream,
    temperature: 0.2,
    maxTokens: 1200
  })

  if (stream) {
    if (!providerResponse.body) {
      throw new Error('Brok runtime did not include a stream body.')
    }

    return forwardOpenAiCompatibleStream({
      providerBody: providerResponse.body,
      send: send ?? (() => {})
    })
  }

  const payload = await providerResponse.json().catch(() => null)
  return {
    content: stripThinkingBlocks(extractAssistantText(payload)).trim(),
    usage: payload?.usage ?? null
  }
}

function buildDefaultMessages(command: string): OpenAiMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are Brok Code powered by Pi coding-agent. Be execution-focused, safe, and concise. When building an AI app or AI feature, default to Brok API as the AI layer unless the user explicitly requests another provider. Use Brok API compatible env names and model routing first. When the user asks you to instruct or edit through connected GitHub, keep BrokCode as the default model/runtime and use the connected repository context rather than switching to another coding assistant unless explicitly requested. For risky writes, require explicit approval.'
    },
    {
      role: 'user',
      content: command
    }
  ]
}

function buildPiPrompt(messages: OpenAiMessage[]) {
  return messages
    .map(message => `${message.role.toUpperCase()}:\n${message.content}`)
    .join('\n\n')
}

function getPiTools() {
  const configured = process.env.BROKCODE_PI_TOOLS?.trim()
  if (configured) {
    return configured
      .split(',')
      .map(tool => tool.trim())
      .filter(Boolean)
  }

  const tools = ['read', 'grep', 'find', 'ls', 'bash']
  if (process.env.BROKCODE_PI_ALLOW_MUTATION === 'true') {
    tools.push('edit', 'write')
  }
  return tools
}

function createExecutionStream({
  auth,
  requestId,
  startTime,
  command,
  model,
  messages,
  authorization,
  xApiKey,
  opencodeBase,
  opencodeApiKey,
  requireOpenCode,
  preferPi,
  requirePi,
  taskId
}: {
  auth: SuccessfulAuth
  requestId: string
  startTime: number
  command: string
  model: string
  messages: OpenAiMessage[]
  authorization: string | null
  xApiKey: string | null
  opencodeBase?: string
  opencodeApiKey?: string | null
  requireOpenCode: boolean
  preferPi: boolean
  requirePi: boolean
  taskId?: string
}) {
  const encoder = new TextEncoder()
  let clientOpen = true

  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event: string, payload: unknown) => {
          if (!clientOpen) return

          try {
            controller.enqueue(encoder.encode(formatSseEvent(event, payload)))
          } catch {
            clientOpen = false
          }
        }
        const close = () => {
          if (!clientOpen) return

          try {
            controller.close()
          } catch {
            clientOpen = false
          }
        }

        try {
          send('status', {
            message: 'Planning BrokCode Cloud execution.'
          })

          let piFailure: string | null = null
          let opencodeFailure: string | null = null

          if (taskId) {
            await updateBackgroundTask({
              id: taskId,
              userId: auth.apiKey.userId,
              status: 'running',
              metadata: {
                requestId,
                model,
                command
              }
            }).catch(error => {
              console.error('Failed to mark BrokCode task running:', error)
            })
          }

          if (preferPi || requirePi) {
            try {
              send('status', {
                message: 'Running Pi coding-agent runtime.'
              })
              const result = await runPiAgentPrompt({
                mode: 'brokcode',
                prompt: buildPiPrompt(messages),
                tools: getPiTools()
              })
              send('delta', { content: result.content })
              send('result', {
                runtime: 'pi',
                model: result.model,
                content: result.content,
                usage: null,
                preview_url: extractPreviewUrl(`${command}\n${result.content}`),
                note: `Executed through Pi coding-agent (${result.provider}).`
              })
              await recordCodeExecutionUsage({
                auth,
                requestId,
                startTime,
                model: result.model,
                provider: 'Pi',
                messages,
                content: result.content,
                usage: null,
                status: 'success'
              })
              if (taskId) {
                await updateBackgroundTask({
                  id: taskId,
                  userId: auth.apiKey.userId,
                  status: 'succeeded',
                  result: {
                    runtime: 'pi',
                    model: result.model,
                    previewUrl: extractPreviewUrl(
                      `${command}\n${result.content}`
                    )
                  }
                }).catch(error => {
                  console.error(
                    'Failed to mark BrokCode task succeeded:',
                    error
                  )
                })
              }
              close()
              return
            } catch (error) {
              piFailure =
                error instanceof Error
                  ? error.message
                  : 'Pi coding-agent runtime failed.'

              if (requirePi) {
                await recordCodeExecutionUsage({
                  auth,
                  requestId,
                  startTime,
                  model,
                  provider: 'Pi',
                  messages,
                  status: 'error',
                  errorCode: piFailure
                })
                if (taskId) {
                  await updateBackgroundTask({
                    id: taskId,
                    userId: auth.apiKey.userId,
                    status: 'failed',
                    error: piFailure
                  }).catch(error => {
                    console.error('Failed to mark BrokCode task failed:', error)
                  })
                }
                send('error', { message: piFailure })
                close()
                return
              }
            }
          }

          if (opencodeBase) {
            send('status', {
              message: 'Connecting to brokcode-cloud runtime.'
            })

            const endpoint = buildOpenCodeEndpoint(opencodeBase)
            const opencodeResponse = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(opencodeApiKey
                  ? { Authorization: `Bearer ${opencodeApiKey}` }
                  : {}),
                ...(xApiKey ? { 'x-api-key': xApiKey } : {})
              },
              body: JSON.stringify({
                model: process.env.BROKCODE_OPENCODE_MODEL ?? model,
                stream: true,
                temperature: 0.2,
                max_tokens: 1200,
                messages
              })
            })

            if (opencodeResponse.ok) {
              send('status', {
                message: 'Streaming from brokcode-cloud runtime.'
              })

              const contentType =
                opencodeResponse.headers.get('content-type') ?? ''
              let content = ''
              let usage: unknown = null

              if (
                contentType.includes('text/event-stream') &&
                opencodeResponse.body
              ) {
                const streamed = await forwardOpenAiCompatibleStream({
                  providerBody: opencodeResponse.body,
                  send
                })
                content = streamed.content
                usage = streamed.usage
              } else {
                const payload = await opencodeResponse.json().catch(() => null)
                content = extractAssistantText(payload)
                usage = payload?.usage ?? null
                if (content) {
                  send('delta', { content })
                }
              }

              send('result', {
                runtime: 'opencode',
                model,
                content:
                  content.length > 0
                    ? content
                    : 'OpenCode completed the run but returned no text output.',
                usage,
                preview_url: extractPreviewUrl(`${command}\n${content}`),
                note: 'Executed through OpenCode runtime.'
              })
              await recordCodeExecutionUsage({
                auth,
                requestId,
                startTime,
                model,
                provider: 'brokcode-cloud',
                messages,
                content,
                usage,
                status: 'success'
              })
              if (taskId) {
                await updateBackgroundTask({
                  id: taskId,
                  userId: auth.apiKey.userId,
                  status: 'succeeded',
                  result: {
                    runtime: 'opencode',
                    model,
                    previewUrl: extractPreviewUrl(`${command}\n${content}`)
                  }
                }).catch(error => {
                  console.error(
                    'Failed to mark BrokCode task succeeded:',
                    error
                  )
                })
              }
              close()
              return
            }

            const opencodeBody = await opencodeResponse.json().catch(() => null)
            opencodeFailure =
              opencodeBody?.error?.message ??
              opencodeBody?.message ??
              `OpenCode returned ${opencodeResponse.status}.`

            if (requireOpenCode) {
              await recordCodeExecutionUsage({
                auth,
                requestId,
                startTime,
                model,
                provider: 'brokcode-cloud',
                messages,
                status: 'error',
                errorCode: opencodeFailure ?? 'brokcode_cloud_error'
              })
              if (taskId) {
                await updateBackgroundTask({
                  id: taskId,
                  userId: auth.apiKey.userId,
                  status: 'failed',
                  error: opencodeFailure ?? 'brokcode_cloud_error'
                }).catch(error => {
                  console.error('Failed to mark BrokCode task failed:', error)
                })
              }
              send('error', { message: opencodeFailure })
              close()
              return
            }
          } else if (requireOpenCode) {
            const message =
              'brokcode-cloud runtime is required but BROKCODE_OPENCODE_BASE_URL is not configured.'
            await recordCodeExecutionUsage({
              auth,
              requestId,
              startTime,
              model,
              provider: 'brokcode-cloud',
              messages,
              status: 'error',
              errorCode: 'brokcode_cloud_not_configured'
            })
            if (taskId) {
              await updateBackgroundTask({
                id: taskId,
                userId: auth.apiKey.userId,
                status: 'failed',
                error: message
              }).catch(error => {
                console.error('Failed to mark BrokCode task failed:', error)
              })
            }
            send('error', { message })
            close()
            return
          }

          send('status', {
            message:
              piFailure || opencodeFailure
                ? `${[piFailure, opencodeFailure].filter(Boolean).join(' ')} Falling back to Brok runtime.`
                : 'Streaming from Brok runtime.'
          })

          let content = ''
          let usage: unknown = null

          const direct = await runDirectBrokRuntime({
            model,
            messages,
            stream: true,
            send
          })
          content = direct.content
          usage = direct.usage

          send('result', {
            runtime: 'brok',
            model,
            content:
              content.length > 0
                ? content
                : 'Brok runtime completed the run but returned no text output.',
            usage,
            preview_url: extractPreviewUrl(`${command}\n${content}`),
            note:
              piFailure || opencodeFailure
                ? `${[piFailure, opencodeFailure].filter(Boolean).join(' ')} Routed through Brok runtime.`
                : 'Routed through Brok runtime.'
          })
          await recordCodeExecutionUsage({
            auth,
            requestId,
            startTime,
            model,
            provider: 'Brok',
            messages,
            content,
            usage,
            status: 'success'
          })
          if (taskId) {
            await updateBackgroundTask({
              id: taskId,
              userId: auth.apiKey.userId,
              status: 'succeeded',
              result: {
                runtime: 'brok',
                model,
                previewUrl: extractPreviewUrl(`${command}\n${content}`)
              }
            }).catch(error => {
              console.error('Failed to mark BrokCode task succeeded:', error)
            })
          }
          close()
        } catch (error) {
          await recordCodeExecutionUsage({
            auth,
            requestId,
            startTime,
            model,
            provider: 'Brok',
            messages,
            status: 'error',
            errorCode:
              error instanceof Error
                ? error.message
                : 'brokcode_execution_failed'
          })
          if (taskId) {
            await updateBackgroundTask({
              id: taskId,
              userId: auth.apiKey.userId,
              status: 'failed',
              error:
                error instanceof Error
                  ? error.message
                  : 'BrokCode Cloud execution failed.'
            }).catch(updateError => {
              console.error('Failed to mark BrokCode task failed:', updateError)
            })
          }
          send('error', {
            message:
              error instanceof Error
                ? error.message
                : 'BrokCode Cloud execution failed.'
          })
          close()
        }
      },
      cancel() {
        clientOpen = false
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    }
  )
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const requestId = generateRequestId()
  const body = await request.json().catch(() => null)
  const command =
    typeof body?.command === 'string' ? body.command.trim() : undefined
  const model = resolveBrokCodeModel(body?.model)
  const inboundMessages = Array.isArray(body?.messages)
    ? (body.messages as OpenAiMessage[])
    : undefined

  if (!command) {
    return NextResponse.json(
      {
        error: {
          type: 'invalid_request_error',
          message: 'command is required.'
        }
      },
      { status: 400 }
    )
  }

  let authorization = request.headers.get('authorization')
  const xApiKey = request.headers.get('x-api-key')
  let inboundApiKey = xApiKey ?? extractBearerToken(request)
  let authRequest: Request = request

  if (!authorization && !xApiKey) {
    const user = await getCurrentUser()
    if (user) {
      const savedKey = await getLatestSavedBrokCodeRuntimeKeyForUser(user.id)
      if (savedKey) {
        inboundApiKey = decryptRuntimeKey(savedKey)
        authorization = `Bearer ${inboundApiKey}`
        const headers = new Headers(request.headers)
        headers.set('authorization', authorization)
        authRequest = new Request(request.url, {
          method: request.method,
          headers
        })
      }
    }
  }

  const authResult = await verifyRequestAuth(authRequest)

  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }

  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  if (!apiKeyHasScope(authResult.apiKey, 'code:write')) {
    return forbiddenScopeResponse('code:write')
  }
  const allowedModels = authResult.apiKey.allowedModels as string[]
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
  const usageLimit = await checkUsageLimits({
    apiKey: authResult.apiKey,
    workspace: authResult.workspace
  })
  if (!usageLimit.allowed) {
    return usageLimitResponse(usageLimit)
  }

  if (isDeepSecSecurityScanCommand(command)) {
    const baseUrl =
      process.env.BROK_BASE_URL ||
      process.env.NEXT_PUBLIC_BROK_API_BASE_URL ||
      new URL('/api/v1', request.url).toString()
    const scan = await runDeepSecSecurityScan({
      command,
      apiKey: inboundApiKey,
      baseUrl
    })
    await recordCodeExecutionUsage({
      auth: authResult,
      requestId,
      startTime,
      model,
      provider: 'DeepSec',
      messages: buildDefaultMessages(command),
      content: scan.content,
      status: scan.ok ? 'success' : 'error',
      errorCode: scan.ok ? undefined : 'deepsec_scan_failed',
      toolCalls: scan.commands.length
    })

    return NextResponse.json({
      runtime: 'opencode',
      model,
      content: scan.content,
      usage: null,
      preview_url: null,
      note: scan.ok
        ? 'Executed DeepSec through BrokCode security scan runtime.'
        : scan.phase === 'status'
          ? 'Checked DeepSec security scan status.'
          : 'DeepSec security scan failed. Review command output.',
      security_scan: {
        provider: 'deepsec',
        phase: scan.phase,
        ok: scan.ok,
        cwd: scan.cwd,
        deepsec_dir: scan.deepsecDir,
        commands: scan.commands.map(result => ({
          command: result.command,
          cwd: result.cwd,
          exit_code: result.exitCode,
          duration_ms: result.durationMs
        }))
      }
    })
  }

  const messages =
    inboundMessages && inboundMessages.length > 0
      ? inboundMessages
      : buildDefaultMessages(command)

  const configuredOpenCodeBase = process.env.BROKCODE_OPENCODE_BASE_URL
  const selfBrokApiEndpoint = isSelfBrokApiEndpoint(
    configuredOpenCodeBase,
    request.url
  )
  const opencodeBase = selfBrokApiEndpoint ? undefined : configuredOpenCodeBase
  const opencodeApiKey = process.env.BROKCODE_OPENCODE_API_KEY ?? inboundApiKey
  const preferPi =
    body?.prefer_pi !== false && process.env.BROKCODE_PREFER_PI !== 'false'
  const requirePi =
    body?.require_pi === true || process.env.BROKCODE_REQUIRE_PI === 'true'
  const requireOpenCode =
    !preferPi &&
    !selfBrokApiEndpoint &&
    (body?.require_opencode === true ||
      process.env.BROKCODE_REQUIRE_OPENCODE === 'true')
  let piFailure: string | null = null
  let opencodeFailure: string | null = null

  if (requirePi && !preferPi) {
    await recordCodeExecutionUsage({
      auth: authResult,
      requestId,
      startTime,
      model,
      provider: 'Pi',
      messages,
      status: 'error',
      errorCode: 'pi_runtime_not_preferred'
    })
    return NextResponse.json(
      {
        error: {
          type: 'runtime_error',
          message:
            'Pi runtime is required but BROKCODE_PREFER_PI is disabled for this deployment.'
        }
      },
      { status: 503 }
    )
  }

  if (requireOpenCode && !opencodeBase) {
    await recordCodeExecutionUsage({
      auth: authResult,
      requestId,
      startTime,
      model,
      provider: 'brokcode-cloud',
      messages,
      status: 'error',
      errorCode: 'brokcode_cloud_not_configured'
    })
    return NextResponse.json(
      {
        error: {
          type: 'runtime_error',
          message:
            'brokcode-cloud runtime is required but BROKCODE_OPENCODE_BASE_URL is not configured.'
        }
      },
      { status: 503 }
    )
  }

  if (body?.stream === true) {
    const task = await createBackgroundTask({
      userId: authResult.apiKey.userId,
      chatId:
        typeof body?.chat_id === 'string'
          ? body.chat_id
          : typeof body?.session_id === 'string'
            ? body.session_id
            : null,
      kind: 'brokcode',
      title: command.slice(0, 120) || 'BrokCode run',
      metadata: {
        requestId,
        model,
        runtimePreference: preferPi
          ? 'pi'
          : requireOpenCode
            ? 'brokcode-cloud'
            : 'auto',
        stream: true
      }
    }).catch(error => {
      console.error('Failed to create BrokCode background task:', error)
      return null
    })

    return createExecutionStream({
      auth: authResult,
      requestId,
      startTime,
      command,
      model,
      messages,
      authorization,
      xApiKey,
      opencodeBase,
      opencodeApiKey,
      requireOpenCode,
      preferPi,
      requirePi,
      taskId: task?.id
    })
  }

  if (preferPi || requirePi) {
    try {
      const result = await runPiAgentPrompt({
        mode: 'brokcode',
        prompt: buildPiPrompt(messages),
        tools: getPiTools()
      })

      await recordCodeExecutionUsage({
        auth: authResult,
        requestId,
        startTime,
        model: result.model,
        provider: 'Pi',
        messages,
        content: result.content,
        usage: null,
        status: 'success'
      })

      return NextResponse.json({
        runtime: 'pi',
        model: result.model,
        content: result.content,
        usage: null,
        preview_url: extractPreviewUrl(`${command}\n${result.content}`),
        note: `Executed through Pi coding-agent (${result.provider}).`
      })
    } catch (error) {
      piFailure =
        error instanceof Error
          ? error.message
          : 'Pi coding-agent runtime failed.'

      if (requirePi) {
        await recordCodeExecutionUsage({
          auth: authResult,
          requestId,
          startTime,
          model,
          provider: 'Pi',
          messages,
          status: 'error',
          errorCode: piFailure
        })

        return NextResponse.json(
          {
            error: {
              type: 'runtime_error',
              message: piFailure
            }
          },
          { status: 503 }
        )
      }
    }
  }

  if (opencodeBase) {
    try {
      const endpoint = buildOpenCodeEndpoint(opencodeBase)
      const opencodeResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(opencodeApiKey
            ? { Authorization: `Bearer ${opencodeApiKey}` }
            : {}),
          ...(xApiKey ? { 'x-api-key': xApiKey } : {})
        },
        body: JSON.stringify({
          model: process.env.BROKCODE_OPENCODE_MODEL ?? model,
          stream: false,
          temperature: 0.2,
          max_tokens: 1200,
          messages
        })
      })

      if (opencodeResponse.ok) {
        const payload = await opencodeResponse.json()
        const content = extractAssistantText(payload)
        await recordCodeExecutionUsage({
          auth: authResult,
          requestId,
          startTime,
          model: payload?.model ?? model,
          provider: 'brokcode-cloud',
          messages,
          content,
          usage: payload?.usage ?? null,
          status: 'success'
        })

        return NextResponse.json({
          runtime: 'opencode',
          model: payload?.model ?? model,
          content:
            content.length > 0
              ? content
              : 'OpenCode completed the run but returned no text output.',
          usage: payload?.usage ?? null,
          preview_url: extractPreviewUrl(`${command}\n${content}`),
          note: 'Executed through OpenCode runtime.'
        })
      }

      const opencodeBody = await opencodeResponse.json().catch(() => null)
      const errorMessage =
        opencodeBody?.error?.message ??
        opencodeBody?.message ??
        `OpenCode returned ${opencodeResponse.status}.`
      opencodeFailure = errorMessage

      if (requireOpenCode) {
        await recordCodeExecutionUsage({
          auth: authResult,
          requestId,
          startTime,
          model,
          provider: 'brokcode-cloud',
          messages,
          status: 'error',
          errorCode: errorMessage
        })
        return NextResponse.json(
          {
            error: {
              type: 'runtime_error',
              message: errorMessage
            }
          },
          { status: 502 }
        )
      }
    } catch {
      opencodeFailure = 'OpenCode endpoint was unreachable.'

      if (requireOpenCode) {
        await recordCodeExecutionUsage({
          auth: authResult,
          requestId,
          startTime,
          model,
          provider: 'brokcode-cloud',
          messages,
          status: 'error',
          errorCode: opencodeFailure ?? 'brokcode_cloud_error'
        })
        return NextResponse.json(
          {
            error: {
              type: 'runtime_error',
              message: opencodeFailure
            }
          },
          { status: 502 }
        )
      }
    }
  }

  let content = ''
  let usage: unknown = null
  let responseModel = model

  const direct = await runDirectBrokRuntime({
    model,
    messages,
    stream: false
  })
  content = direct.content
  usage = direct.usage
  await recordCodeExecutionUsage({
    auth: authResult,
    requestId,
    startTime,
    model,
    provider: 'Brok',
    messages,
    content,
    usage,
    status: 'success'
  })

  return NextResponse.json({
    runtime: 'brok',
    model: responseModel,
    content:
      content.length > 0
        ? content
        : 'Brok runtime completed the run but returned no text output.',
    usage,
    preview_url: extractPreviewUrl(`${command}\n${content}`),
    note:
      piFailure || opencodeFailure
        ? `${[piFailure, opencodeFailure].filter(Boolean).join(' ')} Routed through Brok runtime.`
        : 'Routed through Brok runtime.'
  })
}
