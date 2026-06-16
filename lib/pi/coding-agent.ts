import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager
} from '@earendil-works/pi-coding-agent'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { stripThinkingBlocks } from '@/lib/utils/strip-thinking-blocks'

type PiAgentMode = 'brokmail' | 'brokcode'

export type PiAgentRunInput = {
  mode: PiAgentMode
  prompt: string
  cwd?: string
  provider?: string
  model?: string
  tools?: string[]
  noTools?: 'all' | 'builtin'
  timeoutMs?: number
}

export type PiAgentRunResult = {
  content: string
  provider: string
  model: string
  sessionId: string
  events: number
}

const DEFAULT_MODELS = {
  anthropic: [
    'claude-sonnet-4-5',
    'claude-4-sonnet-20250514',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-20241022'
  ],
  openai: ['gpt-4.1', 'gpt-4o', 'gpt-4.1-mini'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']
}

function getOpenAiCompatiblePiConfig() {
  const explicitProvider = process.env.PI_AGENT_PROVIDER?.trim()
  const hasPiCompatibleConfig = Boolean(
    process.env.PI_AGENT_OPENAI_COMPATIBLE_BASE_URL?.trim() ||
      process.env.PI_AGENT_OPENAI_COMPATIBLE_API_KEY?.trim()
  )

  if (
    explicitProvider &&
    ['anthropic', 'openai', 'google'].includes(explicitProvider) &&
    !hasPiCompatibleConfig
  ) {
    return null
  }

  const baseUrl =
    process.env.PI_AGENT_OPENAI_COMPATIBLE_BASE_URL ??
    process.env.OPENAI_COMPATIBLE_API_BASE_URL
  const apiKey =
    process.env.PI_AGENT_OPENAI_COMPATIBLE_API_KEY ??
    process.env.OPENAI_COMPATIBLE_API_KEY

  if (!baseUrl?.trim() || !apiKey?.trim()) {
    return null
  }

  return {
    provider: explicitProvider ?? 'brok-pi',
    model:
      process.env.PI_AGENT_MODEL ??
      process.env.BROK_PI_MODEL ??
      process.env.OPENAI_COMPATIBLE_MODEL ??
      process.env.BROK_PROVIDER_MODEL ??
      'MiniMax-M2.7-highspeed',
    baseUrl: baseUrl.trim()
  }
}

function createOpenAiCompatibleModelsFile() {
  const config = getOpenAiCompatiblePiConfig()
  if (!config) return null

  const dir = mkdtempSync(path.join(tmpdir(), 'brok-pi-models-'))
  const filePath = path.join(dir, 'models.json')

  writeFileSync(
    filePath,
    JSON.stringify(
      {
        providers: {
          [config.provider]: {
            baseUrl: config.baseUrl,
            api: 'openai-completions',
            apiKey: process.env.PI_AGENT_OPENAI_COMPATIBLE_API_KEY?.trim()
              ? 'PI_AGENT_OPENAI_COMPATIBLE_API_KEY'
              : 'OPENAI_COMPATIBLE_API_KEY',
            authHeader: true,
            compat: {
              supportsDeveloperRole: false,
              supportsReasoningEffort: false
            },
            models: [
              {
                id: config.model,
                name: `Brok Pi (${config.model})`,
                input: ['text'],
                contextWindow: 204800,
                maxTokens: 8192,
                reasoning: false,
                cost: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0
                }
              }
            ]
          }
        }
      },
      null,
      2
    ),
    'utf8'
  )

  return { filePath, dir, ...config }
}

function configureAuthStorage() {
  const authStorage = AuthStorage.inMemory()

  const providerKeys: Array<[string, string | undefined]> = [
    ['anthropic', process.env.PI_AGENT_ANTHROPIC_API_KEY],
    ['anthropic', process.env.ANTHROPIC_API_KEY],
    ['openai', process.env.PI_AGENT_OPENAI_API_KEY],
    ['openai', process.env.OPENAI_API_KEY],
    ['google', process.env.PI_AGENT_GOOGLE_API_KEY],
    ['google', process.env.GOOGLE_GENERATIVE_AI_API_KEY]
  ]

  for (const [provider, key] of providerKeys) {
    if (key?.trim()) {
      authStorage.setRuntimeApiKey(provider, key.trim())
    }
  }

  return authStorage
}

function selectModel({
  modelRegistry,
  provider,
  model
}: {
  modelRegistry: ModelRegistry
  provider?: string
  model?: string
}) {
  const configuredProvider = provider ?? process.env.PI_AGENT_PROVIDER
  const configuredModel = model ?? process.env.PI_AGENT_MODEL

  if (configuredProvider && configuredModel) {
    const selected = modelRegistry.find(configuredProvider, configuredModel)
    if (selected && modelRegistry.hasConfiguredAuth(selected)) {
      return selected
    }
  }

  const preferredProviders = configuredProvider
    ? [configuredProvider]
    : ['anthropic', 'openai', 'google']

  for (const candidateProvider of preferredProviders) {
    const modelIds =
      DEFAULT_MODELS[candidateProvider as keyof typeof DEFAULT_MODELS] ?? []
    for (const modelId of modelIds) {
      const selected = modelRegistry.find(candidateProvider, modelId)
      if (selected && modelRegistry.hasConfiguredAuth(selected)) {
        return selected
      }
    }
  }

  return modelRegistry.getAvailable()[0]
}

function parsePositiveInteger(value: string | undefined) {
  if (!value?.trim()) return null

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return Math.round(parsed)
}

function resolvePiAgentTimeoutMs(mode: PiAgentMode, timeoutMs?: number) {
  if (Number.isFinite(timeoutMs) && timeoutMs && timeoutMs > 0) {
    return Math.round(timeoutMs)
  }

  return (
    parsePositiveInteger(process.env.PI_AGENT_TIMEOUT_MS) ??
    parsePositiveInteger(
      mode === 'brokcode'
        ? process.env.BROKCODE_PI_TIMEOUT_MS
        : process.env.BROKMAIL_PI_TIMEOUT_MS
    ) ??
    (mode === 'brokcode' ? 120_000 : 45_000)
  )
}

function formatPiAgentPromptError({
  error,
  provider,
  model,
  mode
}: {
  error: unknown
  provider: string
  model: string
  mode: PiAgentMode
}) {
  const message =
    error instanceof Error ? error.message : 'Pi coding-agent runtime failed.'

  if (/^fetch failed$/i.test(message.trim())) {
    return new Error(
      `Pi coding-agent could not reach the configured model runtime for ${mode} (${provider}/${model}). Check PI_AGENT_* base URL, model, and API key configuration, then try again.`
    )
  }

  return error instanceof Error ? error : new Error(message)
}

function extractAssistantTextFromSessionState(session: {
  state?: { messages?: unknown[] }
}) {
  const messages = Array.isArray(session.state?.messages)
    ? session.state.messages
    : []

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as
      | {
          role?: string
          content?: Array<{ type?: string; text?: string }>
          stopReason?: string
          errorMessage?: string
        }
      | undefined

    if (message?.role !== 'assistant') continue

    if (message.stopReason === 'error' || message.stopReason === 'aborted') {
      throw new Error(
        message.errorMessage || `Pi coding-agent request ${message.stopReason}.`
      )
    }

    return (
      message.content
        ?.filter(part => part?.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n') ?? ''
    )
  }

  return ''
}

async function withPiAgentTimeout<T>({
  promise,
  timeoutMs,
  mode
}: {
  promise: Promise<T>
  timeoutMs: number
  mode: PiAgentMode
}) {
  let timeout: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(
          `Pi coding-agent timed out after ${Math.round(
            timeoutMs / 1000
          )}s while running ${mode}. Check PI_AGENT_* model settings or the Pi runtime service, then try again.`
        )
      )
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function isPiAgentConfigured() {
  const authStorage = configureAuthStorage()
  const custom = createOpenAiCompatibleModelsFile()
  try {
    const modelRegistry = custom
      ? ModelRegistry.create(authStorage, custom.filePath)
      : ModelRegistry.inMemory(authStorage)
    return Boolean(
      selectModel({
        modelRegistry,
        provider: custom?.provider,
        model: custom?.model
      })
    )
  } finally {
    if (custom) {
      rmSync(custom.dir, { recursive: true, force: true })
    }
  }
}

export async function runPiAgentPrompt({
  mode,
  prompt,
  cwd = process.cwd(),
  provider,
  model,
  tools,
  noTools,
  timeoutMs
}: PiAgentRunInput): Promise<PiAgentRunResult> {
  const authStorage = configureAuthStorage()
  const custom = createOpenAiCompatibleModelsFile()
  const modelRegistry = custom
    ? ModelRegistry.create(authStorage, custom.filePath)
    : ModelRegistry.inMemory(authStorage)
  const selectedModel = selectModel({
    modelRegistry,
    provider: provider ?? custom?.provider,
    model: model ?? custom?.model
  })

  if (!selectedModel) {
    if (custom) {
      rmSync(custom.dir, { recursive: true, force: true })
    }
    throw new Error(
      'Pi coding-agent is installed, but no Pi model is configured. Set PI_AGENT_PROVIDER and PI_AGENT_MODEL with a matching API key, or set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY.'
    )
  }

  const { session } = await createAgentSession({
    cwd,
    model: selectedModel,
    thinkingLevel: 'off',
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 1 }
    }),
    tools,
    noTools:
      noTools ??
      (mode === 'brokmail'
        ? 'all'
        : tools && tools.length > 0
          ? undefined
          : 'builtin')
  })

  let content = ''
  let eventCount = 0
  const agentTimeoutMs = resolvePiAgentTimeoutMs(mode, timeoutMs)

  const unsubscribe = session.subscribe((event: any) => {
    eventCount += 1

    if (
      event?.type === 'message_update' &&
      event?.assistantMessageEvent?.type === 'text_delta' &&
      typeof event.assistantMessageEvent.delta === 'string'
    ) {
      content += event.assistantMessageEvent.delta
    }
  })

  try {
    try {
      await withPiAgentTimeout({
        promise: session.prompt(prompt),
        timeoutMs: agentTimeoutMs,
        mode
      })
    } catch (error) {
      throw formatPiAgentPromptError({
        error,
        provider: selectedModel.provider,
        model: selectedModel.id,
        mode
      })
    }

    const finalContent = stripThinkingBlocks(
      content || extractAssistantTextFromSessionState(session)
    ).trim()
    if (!finalContent) {
      throw new Error('Pi coding-agent completed without assistant output.')
    }

    return {
      content: finalContent,
      provider: selectedModel.provider,
      model: selectedModel.id,
      sessionId: session.sessionId,
      events: eventCount
    }
  } finally {
    unsubscribe()
    session.dispose()
    if (custom) {
      rmSync(custom.dir, { recursive: true, force: true })
    }
  }
}
