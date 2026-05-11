import { NextRequest, NextResponse } from 'next/server'

import { unauthorizedResponse, verifyRequestAuth } from '@/lib/brok/auth'
import { enforceBrokCodeAccountOwnership } from '@/lib/brokcode/account-guard'
import {
  isDeepSecSecurityScanCommand,
  runDeepSecSecurityScan
} from '@/lib/brokcode/security-scan'

export const runtime = 'nodejs'
export const maxDuration = 300

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
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
          send('delta', { content: delta })
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
          send('delta', { content: delta })
        }
        if (payload?.usage) {
          usage = payload.usage
        }
      } catch {}
    }
  }

  return { content, usage }
}

function buildDefaultMessages(command: string): OpenAiMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are Brok Code powered by OpenCode runtime. Be execution-focused, safe, and concise. When building an AI app or AI feature, default to Brok API as the AI layer unless the user explicitly requests another provider. Use Brok API compatible env names and model routing first. For risky writes, require explicit approval.'
    },
    {
      role: 'user',
      content: command
    }
  ]
}

function createExecutionStream({
  request,
  command,
  model,
  messages,
  authorization,
  xApiKey,
  opencodeBase,
  opencodeApiKey,
  requireOpenCode
}: {
  request: NextRequest
  command: string
  model: string
  messages: OpenAiMessage[]
  authorization: string | null
  xApiKey: string | null
  opencodeBase?: string
  opencodeApiKey?: string | null
  requireOpenCode: boolean
}) {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event: string, payload: unknown) => {
          controller.enqueue(encoder.encode(formatSseEvent(event, payload)))
        }

        try {
          send('status', {
            message: 'Planning BrokCode Cloud execution.'
          })

          let opencodeFailure: string | null = null

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
              controller.close()
              return
            }

            const opencodeBody = await opencodeResponse.json().catch(() => null)
            opencodeFailure =
              opencodeBody?.error?.message ??
              opencodeBody?.message ??
              `OpenCode returned ${opencodeResponse.status}.`

            if (requireOpenCode) {
              send('error', { message: opencodeFailure })
              controller.close()
              return
            }
          } else if (requireOpenCode) {
            send('error', {
              message:
                'OpenCode runtime is required but BROKCODE_OPENCODE_BASE_URL is not configured.'
            })
            controller.close()
            return
          }

          send('status', {
            message: opencodeFailure
              ? `${opencodeFailure} Falling back to Brok runtime.`
              : 'Streaming from Brok runtime.'
          })

          const brokRuntimeResponse = await fetch(
            new URL('/api/v1/chat/completions', request.url),
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(authorization ? { Authorization: authorization } : {}),
                ...(xApiKey ? { 'x-api-key': xApiKey } : {})
              },
              body: JSON.stringify({
                model,
                stream: true,
                temperature: 0.2,
                max_tokens: 1200,
                messages
              })
            }
          )

          if (!brokRuntimeResponse.ok) {
            const brokRuntimeBody = await brokRuntimeResponse
              .json()
              .catch(() => null)
            const brokRuntimeMessage =
              brokRuntimeBody?.error?.message ?? 'Brok runtime failed.'
            send('error', {
              message: opencodeFailure
                ? `${opencodeFailure} ${brokRuntimeMessage}`
                : brokRuntimeMessage
            })
            controller.close()
            return
          }

          const contentType =
            brokRuntimeResponse.headers.get('content-type') ?? ''
          let content = ''
          let usage: unknown = null

          if (
            contentType.includes('text/event-stream') &&
            brokRuntimeResponse.body
          ) {
            const streamed = await forwardOpenAiCompatibleStream({
              providerBody: brokRuntimeResponse.body,
              send
            })
            content = streamed.content
            usage = streamed.usage
          } else {
            const payload = await brokRuntimeResponse.json().catch(() => null)
            content = extractAssistantText(payload)
            usage = payload?.usage ?? null
            if (content) {
              send('delta', { content })
            }
          }

          send('result', {
            runtime: 'brok',
            model,
            content:
              content.length > 0
                ? content
                : 'Brok runtime completed the run but returned no text output.',
            usage,
            preview_url: extractPreviewUrl(`${command}\n${content}`),
            note: opencodeFailure
              ? `${opencodeFailure} Routed through Brok runtime.`
              : 'Routed through Brok runtime.'
          })
          controller.close()
        } catch (error) {
          send('error', {
            message:
              error instanceof Error
                ? error.message
                : 'BrokCode Cloud execution failed.'
          })
          controller.close()
        }
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
  const body = await request.json().catch(() => null)
  const command =
    typeof body?.command === 'string' ? body.command.trim() : undefined
  const model = typeof body?.model === 'string' ? body.model : 'brok-code'
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

  const authResult = await verifyRequestAuth(request)
  if (!authResult.success) {
    return unauthorizedResponse(authResult)
  }
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  const authorization = request.headers.get('authorization')
  const xApiKey = request.headers.get('x-api-key')
  const inboundApiKey = xApiKey ?? extractBearerToken(request)

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

  const opencodeBase = process.env.BROKCODE_OPENCODE_BASE_URL
  const opencodeApiKey =
    process.env.BROKCODE_OPENCODE_API_KEY ?? extractBearerToken(request)
  const requireOpenCode =
    body?.require_opencode === true ||
    process.env.BROKCODE_REQUIRE_OPENCODE === 'true'
  let opencodeFailure: string | null = null

  if (requireOpenCode && !opencodeBase) {
    return NextResponse.json(
      {
        error: {
          type: 'runtime_error',
          message:
            'OpenCode runtime is required but BROKCODE_OPENCODE_BASE_URL is not configured.'
        }
      },
      { status: 503 }
    )
  }

  if (body?.stream === true) {
    return createExecutionStream({
      request,
      command,
      model,
      messages,
      authorization,
      xApiKey,
      opencodeBase,
      opencodeApiKey,
      requireOpenCode
    })
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

  const brokRuntimeResponse = await fetch(
    new URL('/api/v1/chat/completions', request.url),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
        ...(xApiKey ? { 'x-api-key': xApiKey } : {})
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        max_tokens: 1200,
        messages
      })
    }
  )

  if (!brokRuntimeResponse.ok) {
    const brokRuntimeBody = await brokRuntimeResponse.json().catch(() => null)
    const brokRuntimeMessage =
      brokRuntimeBody?.error?.message ?? 'Brok runtime failed.'

    return NextResponse.json(
      {
        error: {
          type: 'runtime_error',
          message: opencodeFailure
            ? `${opencodeFailure} ${brokRuntimeMessage}`
            : brokRuntimeMessage
        }
      },
      { status: 502 }
    )
  }

  const payload = await brokRuntimeResponse.json()
  const content = extractAssistantText(payload)

  return NextResponse.json({
    runtime: 'brok',
    model: payload?.model ?? model,
    content:
      content.length > 0
        ? content
        : 'Brok runtime completed the run but returned no text output.',
    usage: payload?.usage ?? null,
    preview_url: extractPreviewUrl(`${command}\n${content}`),
    note: opencodeFailure
      ? `${opencodeFailure} Routed through Brok runtime.`
      : 'Routed through Brok runtime.'
  })
}
