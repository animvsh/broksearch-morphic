import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import {
  apiKeyHasScope,
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
import {
  BrokCodeAuthResult,
  enforceBrokCodeAccountOwnership,
  getBrokCodeBrowserSessionAuth
} from '@/lib/brokcode/account-guard'
import {
  decryptInsForgeAdminKey,
  publicBrokCodeBackendMetadata
} from '@/lib/brokcode/backend-provider'
import {
  buildFallbackGeneratedAppFiles,
  extractGeneratedBrokCodeFiles,
  inspectGeneratedBrokCodeAppQuality,
  prepareGeneratedBrokCodeFiles,
  shouldCreateFallbackGeneratedApp
} from '@/lib/brokcode/generated-files'
import { getBrokCodeGenerationSystemPrompt } from '@/lib/brokcode/generation-prompt'
import {
  fetchInsForgeBackendContext,
  formatInsForgeBackendContextForPrompt
} from '@/lib/brokcode/insforge'
import {
  decryptRuntimeKey,
  getLatestSavedBrokCodeRuntimeKeyForUser
} from '@/lib/brokcode/key-vault'
import { buildManagedPreviewSummary } from '@/lib/brokcode/managed-preview-summary'
import {
  makeManagedPreviewUrl,
  resolvePublicPreviewOrigin
} from '@/lib/brokcode/preview'
import {
  getBrokCodeProject,
  getBrokCodeProjectBackend,
  updateBrokCodeProjectPreview,
  upsertBrokCodeProjectFile
} from '@/lib/brokcode/project-store'
import {
  isDeepSecSecurityScanCommand,
  runDeepSecSecurityScan
} from '@/lib/brokcode/security-scan'
import { runPiAgentPrompt } from '@/lib/pi/coding-agent'
import {
  appendBackgroundTaskEvent,
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

type SuccessfulAuth = BrokCodeAuthResult

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
  const matches = text.matchAll(/https?:\/\/[^\s"'<>`)]+/gi)

  for (const match of matches) {
    const rawUrl = match[0].replace(/[),.;:!?`]+$/, '')

    try {
      const parsed = new URL(rawUrl)
      const hostname = parsed.hostname.toLowerCase()
      const pathname = parsed.pathname.toLowerCase()

      if (hostname === 'api.brok.io' || pathname.startsWith('/v1/')) {
        continue
      }

      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.railway.app') ||
        pathname.startsWith('/api/brokcode/previews/')
      ) {
        return parsed.toString()
      }
    } catch {}
  }

  return null
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

function normalizeUsageText(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().replace(/[^a-zA-Z0-9._:-]/g, '-')
  return normalized || fallback
}

function classifyCommandType(command: string) {
  const lower = command.toLowerCase()
  if (isDeepSecSecurityScanCommand(command)) return 'security_scan'
  if (/\b(pr|pull request|github)\b/.test(lower)) return 'github'
  if (/\b(deploy|publish|ship)\b/.test(lower)) return 'deploy'
  if (/\b(build|create|scaffold|generate|make)\b/.test(lower)) return 'build'
  if (/\b(test|check|lint|typecheck)\b/.test(lower)) return 'verify'
  if (/\b(fix|bug|error|broken)\b/.test(lower)) return 'fix'
  return 'build'
}

function canUseGenericBrokFallback({
  source,
  commandType,
  allowBrokFallback
}: {
  source?: string
  commandType?: string
  allowBrokFallback?: boolean
}) {
  if (allowBrokFallback) return true
  if (source?.toLowerCase() !== 'browser') return true

  const normalizedCommandType = commandType?.toLowerCase()
  return (
    normalizedCommandType === 'verify' ||
    normalizedCommandType === 'security_scan'
  )
}

function formatBrokCodeRuntimeError(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'BrokCode Cloud execution failed.'

  if (/^fetch failed$/i.test(message.trim())) {
    return 'BrokCode runtime could not reach its configured model provider. Check the BrokCode Pi/OpenCode provider base URL and API key configuration, then try again.'
  }

  return message
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

async function persistGeneratedProjectOutput({
  auth,
  projectId,
  origin,
  content,
  command,
  taskId,
  send
}: {
  auth: SuccessfulAuth
  projectId?: string | null
  origin: string
  content: string
  command?: string
  taskId?: string
  send?: (event: string, payload: unknown) => void
}) {
  if (!projectId) return null

  const project = await getBrokCodeProject({
    id: projectId,
    workspaceId: auth.workspace.id,
    userId: auth.apiKey.userId
  })
  if (!project) return null

  const extractedFiles = extractGeneratedBrokCodeFiles(content)
  const usedFallback =
    extractedFiles.length === 0 && shouldCreateFallbackGeneratedApp(command)
  const rawFiles =
    extractedFiles.length > 0
      ? extractedFiles
      : usedFallback
        ? buildFallbackGeneratedAppFiles({
            command,
            fallbackTitle: project.name
          })
        : []
  const files = prepareGeneratedBrokCodeFiles(rawFiles, {
    fallbackTitle: project.name
  })
  if (files.length === 0) return null
  const quality = inspectGeneratedBrokCodeAppQuality(files)

  if (taskId) {
    await appendBackgroundTaskEvent({
      id: taskId,
      userId: auth.apiKey.userId,
      message:
        quality.issues.length > 0
          ? `Saving ${files.length} generated file${files.length === 1 ? '' : 's'}; preview hygiene applied.`
          : `Saving ${files.length} generated file${files.length === 1 ? '' : 's'}.`,
      progress: 72,
      metadata: {
        generatedFileCount: files.length,
        qualityIssues: quality.issues
      }
    }).catch(error => {
      console.error('Failed to append BrokCode file-save event:', error)
    })
  }

  for (const file of files) {
    await upsertBrokCodeProjectFile({
      projectId: project.id,
      workspaceId: auth.workspace.id,
      path: file.path,
      content: file.content,
      language: file.language
    })
  }

  send?.('files', {
    project_id: project.id,
    count: files.length,
    files: files.map(file => ({
      path: file.path,
      language: file.language
    })),
    quality
  })

  const previewUrl = makeManagedPreviewUrl({
    origin,
    projectId: project.id
  })
  await updateBrokCodeProjectPreview({
    projectId: project.id,
    workspaceId: auth.workspace.id,
    userId: auth.apiKey.userId,
    previewUrl,
    metadata: {
      mode: 'managed_static',
      fileCount: files.length,
      quality,
      generatedAt: new Date().toISOString(),
      source: 'runtime_output'
    }
  })

  if (taskId) {
    await appendBackgroundTaskEvent({
      id: taskId,
      userId: auth.apiKey.userId,
      message: 'Cloud preview is ready.',
      progress: 88,
      metadata: { previewUrl }
    }).catch(error => {
      console.error('Failed to append BrokCode preview event:', error)
    })
  }

  send?.('preview', {
    project_id: project.id,
    preview_url: previewUrl,
    file_count: files.length,
    quality
  })

  return {
    files,
    previewUrl,
    usedFallback
  }
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
  toolCalls,
  source,
  sessionId,
  commandType,
  projectId,
  backendProvider,
  backendStatus,
  backendProjectUrl
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
  source?: string
  sessionId?: string
  commandType?: string
  projectId?: string | null
  backendProvider?: string
  backendStatus?: string
  backendProjectUrl?: string | null
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
    apiKeyId: auth.isBrowserSession ? null : auth.apiKey.id,
    endpoint: 'code',
    model,
    provider,
    surface: 'brokcode',
    runtime: provider,
    source,
    sessionId,
    inputTokens,
    outputTokens,
    toolCalls: toolCalls ?? 0,
    providerCostUsd: 0,
    billedUsd: 0,
    latencyMs: Date.now() - startTime,
    status,
    errorCode,
    metadata: {
      commandType,
      projectId,
      backendProvider,
      backendStatus,
      backendProjectUrl
    }
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
    maxTokens: 4096
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
      content: getBrokCodeGenerationSystemPrompt()
    },
    {
      role: 'user',
      content: command
    }
  ]
}

async function buildBrokCodeProjectContext({
  auth,
  projectId
}: {
  auth: SuccessfulAuth
  projectId: string | null
}) {
  if (!projectId) return ''

  const project = await getBrokCodeProject({
    id: projectId,
    workspaceId: auth.workspace.id,
    userId: auth.apiKey.userId
  }).catch(error => {
    console.error('BrokCode project context lookup failed:', error)
    return null
  })
  if (!project) return ''

  const backend = getBrokCodeProjectBackend(project)
  const projectLines = [
    'Saved BrokCode project context:',
    `Project: ${project.name} (${project.id})`,
    `Slug: ${project.slug}`,
    project.username ? `Username/subdomain handle: ${project.username}` : null,
    `Backend: ${backend.provider} (${backend.status}; health ${backend.health})`
  ].filter(Boolean)

  if (backend.provider !== 'insforge' || !backend.projectUrl) {
    return projectLines.join('\n')
  }

  const liveContext = await fetchInsForgeBackendContext({
    projectUrl: backend.projectUrl,
    adminKey: decryptInsForgeAdminKey(backend)
  }).catch(error => {
    console.error('InsForge context fetch failed:', error)
    return null
  })

  return [
    ...projectLines,
    `Backend public metadata: ${JSON.stringify(publicBrokCodeBackendMetadata(backend))}`,
    [
      'Generated app InsForge environment contract:',
      `VITE_INSFORGE_URL=${backend.projectUrl}`,
      `NEXT_PUBLIC_INSFORGE_URL=${backend.projectUrl}`,
      backend.appkey
        ? `VITE_INSFORGE_APP_KEY=${backend.appkey}\nNEXT_PUBLIC_INSFORGE_APP_KEY=${backend.appkey}`
        : 'Public app key is not configured yet; use the public auth config endpoint before requiring login.',
      'Never write the InsForge admin access key into generated source, browser env, logs, or previews.'
    ].join('\n'),
    formatInsForgeBackendContextForPrompt(liveContext)
  ]
    .filter(Boolean)
    .join('\n\n')
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
  allowBrokFallback,
  taskId,
  usageContext,
  requestOrigin
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
  allowBrokFallback: boolean
  taskId?: string
  requestOrigin: string
  usageContext: {
    source?: string
    sessionId?: string
    commandType?: string
    projectId?: string | null
  }
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
            message: 'Planning the build.'
          })

          let piFailure: string | null = null
          let opencodeFailure: string | null = null

          if (taskId) {
            send('task', {
              task_id: taskId,
              status_url: `/api/tasks/${taskId}`,
              events_url: `/api/tasks/${taskId}/events`
            })
            await updateBackgroundTask({
              id: taskId,
              userId: auth.apiKey.userId,
              status: 'running',
              metadata: {
                requestId,
                model,
                command,
                projectId: usageContext.projectId,
                sessionId: usageContext.sessionId,
                progress: 12
              }
            }).catch(error => {
              console.error('Failed to mark BrokCode task running:', error)
            })
            await appendBackgroundTaskEvent({
              id: taskId,
              userId: auth.apiKey.userId,
              message: 'Loaded project context and started the coding runtime.',
              progress: 18
            }).catch(error => {
              console.error('Failed to append BrokCode start event:', error)
            })
          }

          if (preferPi || requirePi) {
            try {
              send('status', {
                message: 'Building with the coding agent.'
              })
              const result = await runPiAgentPrompt({
                mode: 'brokcode',
                prompt: buildPiPrompt(messages),
                tools: getPiTools()
              })
              const persisted = await persistGeneratedProjectOutput({
                auth,
                projectId: usageContext.projectId,
                origin: requestOrigin,
                content: result.content,
                command,
                taskId,
                send
              }).catch(error => {
                console.error('Failed to persist Pi BrokCode output:', error)
                return null
              })
              const previewUrl =
                persisted?.previewUrl ??
                extractPreviewUrl(`${command}\n${result.content}`)
              const builderContent =
                persisted?.usedFallback && previewUrl
                  ? buildManagedPreviewSummary({
                      command,
                      files: persisted.files,
                      previewUrl
                    })
                  : result.content
              send('delta', { content: builderContent })
              send('result', {
                runtime: 'pi',
                model: result.model,
                content: builderContent,
                usage: null,
                preview_url: previewUrl,
                task_id: taskId ?? null,
                status_url: taskId ? `/api/tasks/${taskId}` : null,
                events_url: taskId ? `/api/tasks/${taskId}/events` : null,
                generated_files: persisted?.files.map(file => file.path) ?? [],
                note: 'Built with BrokCode Cloud.'
              })
              await recordCodeExecutionUsage({
                ...usageContext,
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
                    previewUrl,
                    generatedFiles:
                      persisted?.files.map(file => file.path) ?? []
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
                  ...usageContext,
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
              message: 'Opening the cloud builder.'
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
                message: 'Writing the app.'
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
              const persisted = await persistGeneratedProjectOutput({
                auth,
                projectId: usageContext.projectId,
                origin: requestOrigin,
                content,
                command,
                taskId,
                send
              }).catch(error => {
                console.error(
                  'Failed to persist OpenCode BrokCode output:',
                  error
                )
                return null
              })
              const previewUrl =
                persisted?.previewUrl ??
                extractPreviewUrl(`${command}\n${content}`)
              const builderContent =
                persisted?.usedFallback && previewUrl
                  ? buildManagedPreviewSummary({
                      command,
                      files: persisted.files,
                      previewUrl
                    })
                  : content

              send('result', {
                runtime: 'opencode',
                model,
                content:
                  builderContent.length > 0
                    ? builderContent
                    : 'OpenCode completed the run but returned no text output.',
                usage,
                preview_url: previewUrl,
                generated_files: persisted?.files.map(file => file.path) ?? [],
                note: 'Executed through OpenCode runtime.'
              })
              await recordCodeExecutionUsage({
                ...usageContext,
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
                    previewUrl,
                    generatedFiles:
                      persisted?.files.map(file => file.path) ?? []
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
                ...usageContext,
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
              ...usageContext,
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

          if (
            !canUseGenericBrokFallback({
              source: usageContext.source,
              commandType: usageContext.commandType,
              allowBrokFallback
            })
          ) {
            const message =
              piFailure || opencodeFailure
                ? `${[piFailure, opencodeFailure].filter(Boolean).join(' ')} BrokCode Cloud could not complete this build/edit run.`
                : 'BrokCode Cloud runtime is not available for build/edit runs.'
            await recordCodeExecutionUsage({
              ...usageContext,
              auth,
              requestId,
              startTime,
              model,
              provider: 'BrokCode Cloud',
              messages,
              status: 'error',
              errorCode: 'runtime_unavailable'
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
                ? 'Switching to the backup builder.'
                : 'Writing the app.'
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
          const persisted = await persistGeneratedProjectOutput({
            auth,
            projectId: usageContext.projectId,
            origin: requestOrigin,
            content,
            command,
            taskId,
            send
          }).catch(error => {
            console.error('Failed to persist BrokCode output:', error)
            return null
          })
          const previewUrl =
            persisted?.previewUrl ?? extractPreviewUrl(`${command}\n${content}`)

          send('result', {
            runtime: 'brok',
            model,
            content:
              content.length > 0
                ? content
                : 'Brok runtime completed the run but returned no text output.',
            usage,
            preview_url: previewUrl,
            task_id: taskId ?? null,
            status_url: taskId ? `/api/tasks/${taskId}` : null,
            events_url: taskId ? `/api/tasks/${taskId}/events` : null,
            generated_files: persisted?.files.map(file => file.path) ?? [],
            note:
              piFailure || opencodeFailure
                ? `${[piFailure, opencodeFailure].filter(Boolean).join(' ')} Routed through Brok runtime.`
                : 'Routed through Brok runtime.'
          })
          await recordCodeExecutionUsage({
            ...usageContext,
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
                previewUrl,
                generatedFiles: persisted?.files.map(file => file.path) ?? []
              }
            }).catch(error => {
              console.error('Failed to mark BrokCode task succeeded:', error)
            })
          }
          close()
        } catch (error) {
          const errorMessage = formatBrokCodeRuntimeError(error)
          await recordCodeExecutionUsage({
            ...usageContext,
            auth,
            requestId,
            startTime,
            model,
            provider: 'Brok',
            messages,
            status: 'error',
            errorCode: errorMessage
          })
          if (taskId) {
            await updateBackgroundTask({
              id: taskId,
              userId: auth.apiKey.userId,
              status: 'failed',
              error: errorMessage
            }).catch(updateError => {
              console.error('Failed to mark BrokCode task failed:', updateError)
            })
          }
          send('error', {
            message: errorMessage
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
  const publicOrigin = resolvePublicPreviewOrigin(request)
  const body = await request.json().catch(() => null)
  const command =
    typeof body?.command === 'string' ? body.command.trim() : undefined
  const model = resolveBrokCodeModel(body?.model)
  const inboundMessages = Array.isArray(body?.messages)
    ? (body.messages as OpenAiMessage[])
    : undefined
  const codeUsageContext = {
    source: normalizeUsageText(body?.source, 'api'),
    sessionId: normalizeUsageText(body?.session_id, 'default'),
    commandType: command ? classifyCommandType(command) : 'unknown',
    projectId:
      typeof body?.project_id === 'string' && body.project_id.trim()
        ? body.project_id.trim()
        : null,
    backendProvider: normalizeUsageText(body?.backend_provider, 'none'),
    backendStatus: normalizeUsageText(body?.backend_status, 'not_configured'),
    backendProjectUrl:
      typeof body?.backend_project_url === 'string' &&
      body.backend_project_url.trim()
        ? body.backend_project_url.trim()
        : null
  }

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
  const hasExplicitCredential = Boolean(authorization || xApiKey)
  let inboundApiKey = xApiKey ?? extractBearerToken(request)
  let authRequest: Request = request
  let browserSessionAuth: SuccessfulAuth | null = null

  if (!hasExplicitCredential && codeUsageContext.source === 'browser') {
    browserSessionAuth = await getBrokCodeBrowserSessionAuth()
  }

  if (!hasExplicitCredential && !browserSessionAuth) {
    const user = await getCurrentUser()
    if (user) {
      const savedKey = await getLatestSavedBrokCodeRuntimeKeyForUser(
        user.id
      ).catch(error => {
        console.error('BrokCode saved runtime key lookup failed:', error)
        return null
      })
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

  const rawAuthResult =
    browserSessionAuth ?? (await verifyRequestAuth(authRequest))

  if (!rawAuthResult.success) {
    return unauthorizedResponse(rawAuthResult)
  }

  const authResult: SuccessfulAuth = rawAuthResult
  const accountMismatch = await enforceBrokCodeAccountOwnership(authResult)
  if (accountMismatch) return accountMismatch

  if (
    !authResult.isBrowserSession &&
    !apiKeyHasScope(authResult.apiKey, 'code:write')
  ) {
    return forbiddenScopeResponse('code:write')
  }
  const allowedModels = authResult.apiKey.allowedModels as string[]
  if (
    !authResult.isBrowserSession &&
    allowedModels.length > 0 &&
    !allowedModels.includes(model)
  ) {
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
  if (!authResult.isBrowserSession) {
    const usageLimit = await checkUsageLimits({
      apiKey: authResult.apiKey,
      workspace: authResult.workspace
    })
    if (!usageLimit.allowed) {
      return usageLimitResponse(usageLimit)
    }
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
      ...codeUsageContext,
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

  const brokCodeProjectContext = await buildBrokCodeProjectContext({
    auth: authResult,
    projectId: codeUsageContext.projectId
  })
  const baseMessages =
    inboundMessages && inboundMessages.length > 0
      ? inboundMessages
      : buildDefaultMessages(command)
  const messages = brokCodeProjectContext
    ? [
        {
          role: 'system' as const,
          content: brokCodeProjectContext
        },
        ...baseMessages
      ]
    : baseMessages

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
      ...codeUsageContext,
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
      ...codeUsageContext,
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
        command,
        projectId: codeUsageContext.projectId,
        runtimePreference: preferPi
          ? 'pi'
          : requireOpenCode
            ? 'brokcode-cloud'
            : 'auto',
        stream: true,
        source: codeUsageContext.source,
        sessionId: codeUsageContext.sessionId,
        commandType: codeUsageContext.commandType,
        progress: 0,
        events: [
          {
            at: new Date().toISOString(),
            message: 'Queued BrokCode run',
            progress: 0
          }
        ]
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
      allowBrokFallback: body?.allow_brok_fallback === true,
      taskId: task?.id,
      requestOrigin: publicOrigin,
      usageContext: codeUsageContext
    })
  }

  if (preferPi || requirePi) {
    try {
      const result = await runPiAgentPrompt({
        mode: 'brokcode',
        prompt: buildPiPrompt(messages),
        tools: getPiTools()
      })
      const persisted = await persistGeneratedProjectOutput({
        auth: authResult,
        projectId: codeUsageContext.projectId,
        origin: publicOrigin,
        content: result.content,
        command
      }).catch(error => {
        console.error('Failed to persist Pi BrokCode output:', error)
        return null
      })
      const previewUrl =
        persisted?.previewUrl ??
        extractPreviewUrl(`${command}\n${result.content}`)
      const builderContent =
        persisted?.usedFallback && previewUrl
          ? buildManagedPreviewSummary({
              command,
              files: persisted.files,
              previewUrl
            })
          : result.content

      await recordCodeExecutionUsage({
        ...codeUsageContext,
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
        content: builderContent,
        usage: null,
        preview_url: previewUrl,
        generated_files: persisted?.files.map(file => file.path) ?? [],
        note: 'Built with BrokCode Cloud.'
      })
    } catch (error) {
      piFailure =
        error instanceof Error
          ? error.message
          : 'Pi coding-agent runtime failed.'

      if (requirePi) {
        await recordCodeExecutionUsage({
          ...codeUsageContext,
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
        const persisted = await persistGeneratedProjectOutput({
          auth: authResult,
          projectId: codeUsageContext.projectId,
          origin: publicOrigin,
          content,
          command
        }).catch(error => {
          console.error('Failed to persist OpenCode BrokCode output:', error)
          return null
        })
        const previewUrl =
          persisted?.previewUrl ?? extractPreviewUrl(`${command}\n${content}`)
        const builderContent =
          persisted?.usedFallback && previewUrl
            ? buildManagedPreviewSummary({
                command,
                files: persisted.files,
                previewUrl
              })
            : content
        await recordCodeExecutionUsage({
          ...codeUsageContext,
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
            builderContent.length > 0
              ? builderContent
              : 'OpenCode completed the run but returned no text output.',
          usage: payload?.usage ?? null,
          preview_url: previewUrl,
          generated_files: persisted?.files.map(file => file.path) ?? [],
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
          ...codeUsageContext,
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
          ...codeUsageContext,
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

  if (
    !canUseGenericBrokFallback({
      source: codeUsageContext.source,
      commandType: codeUsageContext.commandType,
      allowBrokFallback: body?.allow_brok_fallback === true
    })
  ) {
    await recordCodeExecutionUsage({
      ...codeUsageContext,
      auth: authResult,
      requestId,
      startTime,
      model,
      provider: 'BrokCode Cloud',
      messages,
      status: 'error',
      errorCode: 'runtime_unavailable'
    })
    return NextResponse.json(
      {
        error: {
          type: 'runtime_error',
          code: 'runtime_unavailable',
          message:
            'BrokCode Cloud runtime is required for browser build/edit runs.'
        }
      },
      { status: 503 }
    )
  }

  const direct = await runDirectBrokRuntime({
    model,
    messages,
    stream: false
  })
  content = direct.content
  usage = direct.usage
  const persisted = await persistGeneratedProjectOutput({
    auth: authResult,
    projectId: codeUsageContext.projectId,
    origin: publicOrigin,
    content,
    command
  }).catch(error => {
    console.error('Failed to persist BrokCode output:', error)
    return null
  })
  const previewUrl =
    persisted?.previewUrl ?? extractPreviewUrl(`${command}\n${content}`)
  const builderContent =
    persisted?.usedFallback && previewUrl
      ? buildManagedPreviewSummary({
          command,
          files: persisted.files,
          previewUrl
        })
      : content
  await recordCodeExecutionUsage({
    ...codeUsageContext,
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
      builderContent.length > 0
        ? builderContent
        : 'Brok runtime completed the run but returned no text output.',
    usage,
    preview_url: previewUrl,
    generated_files: persisted?.files.map(file => file.path) ?? [],
    note:
      piFailure || opencodeFailure
        ? `${[piFailure, opencodeFailure].filter(Boolean).join(' ')} Routed through Brok runtime.`
        : 'Routed through Brok runtime.'
  })
}
