'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from 'react'
import Link from 'next/link'

import {
  Activity,
  Bot,
  Braces,
  CheckCircle2,
  CircleDot,
  Clock3,
  Code2,
  ExternalLink,
  Eye,
  FileCode2,
  GitBranch,
  Github,
  Globe,
  KeyRound,
  ListChecks,
  Monitor,
  Play,
  PlugZap,
  Radar,
  RefreshCcw,
  Rocket,
  Send,
  Share2,
  Sparkles,
  TerminalSquare,
  User,
  Wand2,
  Zap
} from 'lucide-react'
import { toast } from 'sonner'

import { createShareableChatFromTranscript } from '@/lib/actions/chat'
import {
  brokCodeCommands,
  BrokCodeSubagent,
  SubagentStatus
} from '@/lib/brokcode/data'
import { cn } from '@/lib/utils'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type ChatAction =
  | 'open-pr'
  | 'run-checks'
  | 'connect-github'
  | 'connect-integration'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agentIds?: string[]
  actions?: ChatAction[]
  integrationToolkit?: string
}

type BrokModel = {
  id: string
  name: string
  supports_code: boolean
}

type BrokUsage = {
  requests: number
  input_tokens: number
  output_tokens: number
  billed_usd: number
}

type BrokCodeRuntime = 'opencode' | 'brok' | 'not_connected'
type GithubConnectionStatus = 'checking' | 'connected' | 'ready' | 'unavailable'
type PreviewHealthStatus = 'idle' | 'checking' | 'online' | 'offline'

type ExecutionStepStatus = 'queued' | 'running' | 'done' | 'error'

type ExecutionStep = {
  id: string
  label: string
  detail: string
  status: ExecutionStepStatus
}

type ExecutionRun = {
  id: string
  command: string
  runtime: BrokCodeRuntime
  status: 'running' | 'done' | 'error'
  startedAt: number
  finishedAt?: number
  note?: string
  previewUrl?: string | null
  steps: ExecutionStep[]
}

type SyncedBrokCodeEvent = {
  id: string
  sessionId: string
  source: 'cloud' | 'tui' | 'api'
  role: 'user' | 'assistant' | 'system'
  type: string
  content: string
  createdAt: string
}

type SyncedBrokCodeSession = {
  id: string
  title: string
  sources: Array<'cloud' | 'tui' | 'api'>
  updatedAt: string
  events: SyncedBrokCodeEvent[]
}

type BrokCodeVersion = {
  id: string
  sessionId: string
  command: string
  summary: string
  runtime: BrokCodeRuntime
  status: 'done' | 'error'
  previewUrl?: string | null
  branch?: string | null
  commitSha?: string | null
  prUrl?: string | null
  createdAt: string
}

type BrokCodeStreamResult = {
  runtime: BrokCodeRuntime
  model?: string
  content: string
  usage?: unknown
  preview_url?: string | null
  note?: string
}

type GithubRepoContext = {
  repository: string | null
  remoteUrl: string | null
  currentBranch: string | null
  defaultBranch: string | null
  commitSha: string | null
}

type PreviewHealth = {
  status: PreviewHealthStatus
  message: string
  checkedAt?: string
  httpStatus?: number
}

const BROK_KEY_STORAGE = 'brok_code_api_key'
const BROK_SESSION_STORAGE = 'brok_code_session_id'

const accentStyles = {
  cyan: 'border-cyan-300 bg-cyan-50 text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-50',
  emerald:
    'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-50',
  amber:
    'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50',
  rose: 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-50',
  violet:
    'border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-50',
  blue: 'border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-50'
}

const statusMeta: Record<
  SubagentStatus,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  running: { label: 'Running', icon: Activity },
  blocked: { label: 'Blocked', icon: Clock3 },
  review: { label: 'Reviewing', icon: Radar },
  done: { label: 'Done', icon: CheckCircle2 }
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function encodePortableSharePayload(payload: string) {
  const bytes = new TextEncoder().encode(payload)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createPortableShareUrl(
  transcript: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  title: string
) {
  const boundedMessages = transcript.slice(-30).map(message => ({
    role: message.role,
    content:
      message.content.length > 1500
        ? `${message.content.slice(0, 1497)}...`
        : message.content
  }))

  const payload = {
    v: 1,
    title,
    createdAt: new Date().toISOString(),
    messages:
      boundedMessages.length > 0
        ? boundedMessages
        : [{ role: 'assistant', content: 'Shared from Brok Code.' }]
  }

  const encoded = encodePortableSharePayload(JSON.stringify(payload))
  const url = new URL('/brokcode/shared', window.location.origin)
  url.searchParams.set('data', encoded)
  return url.toString()
}

function statusTone(status: SubagentStatus) {
  if (status === 'running') return 'bg-cyan-500'
  if (status === 'review') return 'bg-violet-500'
  if (status === 'done') return 'bg-emerald-500'
  return 'bg-amber-500'
}

function createRuntimeSubagents(runs: ExecutionRun[]): BrokCodeSubagent[] {
  return runs.slice(0, 6).map((run, index) => {
    const activeStep =
      run.steps.find(step => step.status === 'running') ??
      [...run.steps].reverse().find(step => step.status === 'done') ??
      run.steps[0]
    const completed = run.steps.filter(step => step.status === 'done').length
    const progress =
      run.status === 'done'
        ? 100
        : run.status === 'error'
          ? Math.max(8, Math.round((completed / run.steps.length) * 100))
          : Math.max(
              12,
              Math.round(
                ((completed + (activeStep?.status === 'running' ? 0.5 : 0)) /
                  run.steps.length) *
                  100
              )
            )
    const status: SubagentStatus =
      run.status === 'running'
        ? 'running'
        : run.status === 'error'
          ? 'blocked'
          : 'done'
    const accents: BrokCodeSubagent['accent'][] = [
      'cyan',
      'emerald',
      'violet',
      'amber',
      'blue',
      'rose'
    ]

    return {
      id: run.id,
      name: `Run ${index + 1}`,
      role:
        run.runtime === 'opencode'
          ? 'brokcode-cloud'
          : run.runtime === 'brok'
            ? 'Brok API runtime'
            : 'Waiting for runtime',
      status,
      accent: accents[index % accents.length],
      progress,
      currentTask: activeStep
        ? `${activeStep.label}: ${activeStep.detail}`
        : run.command,
      branch: 'Runtime reported branch unavailable',
      files: run.previewUrl ? [run.previewUrl] : ['No file changes reported'],
      tools: [
        run.runtime === 'opencode' ? 'brokcode-cloud' : 'brok-api',
        'SSE',
        'usage-metering'
      ],
      events: run.steps.map(step => ({
        time: new Date(run.startedAt).toLocaleTimeString(),
        label: `${step.label} - ${step.status}`,
        detail: step.detail
      })),
      nextStep:
        run.status === 'error'
          ? run.note || 'Fix the runtime issue, then rerun the command.'
          : run.status === 'done'
            ? 'Review the output, preview URL, or open a PR.'
            : activeStep?.detail || 'Waiting for the next runtime event.'
    }
  })
}

const executionStepTemplate: ExecutionStep[] = [
  {
    id: 'parse',
    label: 'Parse Command',
    detail: 'Reading intent and scope.',
    status: 'queued'
  },
  {
    id: 'plan',
    label: 'Plan + Subagents',
    detail: 'Selecting subagents and execution plan.',
    status: 'queued'
  },
  {
    id: 'execute',
    label: 'Execute Runtime',
    detail: 'Sending command to runtime.',
    status: 'queued'
  },
  {
    id: 'validate',
    label: 'Validate Output',
    detail: 'Checking response shape and usage.',
    status: 'queued'
  },
  {
    id: 'summarize',
    label: 'Summarize',
    detail: 'Preparing operator-facing result.',
    status: 'queued'
  }
]

const runStreamingHints = [
  'Understanding your command',
  'Planning subagents',
  'Executing in brokcode-cloud',
  'Collecting runtime output',
  'Preparing final response'
]

const integrationConnectMatchers: Array<{ toolkit: string; pattern: RegExp }> =
  [
    { toolkit: 'github', pattern: /\b(github|git hub|repo|repository)\b/i },
    {
      toolkit: 'supabase',
      pattern: /\b(supabase|postgres|database|pgvector)\b/i
    },
    {
      toolkit: 'gmail',
      pattern: /\b(gmail|google mail|inbox|email)\b/i
    },
    {
      toolkit: 'googlecalendar',
      pattern: /\b(google calendar|gcal|calendar)\b/i
    },
    { toolkit: 'linear', pattern: /\b(linear)\b/i },
    { toolkit: 'slack', pattern: /\b(slack)\b/i },
    { toolkit: 'notion', pattern: /\b(notion)\b/i },
    { toolkit: 'vercel', pattern: /\b(vercel)\b/i },
    { toolkit: 'railway', pattern: /\b(railway)\b/i }
  ]

function formatToolkitName(slug: string) {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function detectIntegrationConnectIntent(command: string): string | null {
  const normalized = command.trim().toLowerCase()
  if (!normalized) return null

  const isConnectIntent =
    /\b(connect|integration|authorize|oauth|link|login|sign in)\b/i.test(
      normalized
    )
  if (!isConnectIntent) return null

  for (const matcher of integrationConnectMatchers) {
    if (matcher.pattern.test(normalized)) {
      return matcher.toolkit
    }
  }

  return null
}

function isValidBrokApiKey(value: string) {
  return value.startsWith('brok_sk_')
}

function maskBrokApiKey(value: string) {
  if (value.length < 12) return `${value.slice(0, 4)}...`
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function buildCommandPrompt(command: string) {
  return [
    'You are Brok Code, a coding agent for repository tasks.',
    'Answer with clear execution-focused output.',
    'When the user is building an app or feature with AI, default to Brok API as the AI layer unless they explicitly request another provider.',
    'For AI app work, suggest the Brok API model path first, use Brok API compatible env names, and avoid introducing OpenAI/Anthropic/etc. as the default integration.',
    'If the task is risky (merge, delete, deploy, external write), require explicit approval.',
    `User command: ${command}`
  ].join('\n')
}

function buildCloudStartCommand(prompt: string, connectGithub: boolean) {
  return connectGithub
    ? `Use GitHub mode and start this build in BrokCode Cloud: ${prompt}`
    : prompt
}

function getStoredSessionId() {
  if (typeof window === 'undefined') {
    return 'default'
  }

  return window.localStorage.getItem(BROK_SESSION_STORAGE) || 'default'
}

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

async function pollIntegrationStatus(
  statusUrl: string,
  popup: Window | null,
  timeoutMs: number = 120_000
) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(statusUrl)
      const payload = await response.json().catch(() => null)
      if (payload?.connected) {
        return true
      }
    } catch {}

    if (popup?.closed) {
      try {
        const response = await fetch(statusUrl)
        const payload = await response.json().catch(() => null)
        return Boolean(payload?.connected)
      } catch {
        return false
      }
    }

    await delay(1500)
  }

  return false
}

function normalizePreviewUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function isBrokCodeWorkspaceUrl(value: string) {
  try {
    const parsed = new URL(value)
    if (
      typeof window !== 'undefined' &&
      parsed.origin !== window.location.origin
    ) {
      return false
    }
    return parsed.pathname.startsWith('/brokcode')
  } catch {
    return false
  }
}

function extractPreviewUrlFromText(text: string) {
  const match = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost|[^\s"'<>]+)/i)
  return match?.[0] ?? null
}

async function readBrokCodeExecutionStream(
  response: Response,
  onEvent: (
    event:
      | { type: 'status'; message: string }
      | { type: 'delta'; content: string; accumulated: string }
  ) => void
): Promise<BrokCodeStreamResult> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('BrokCode stream did not include a response body.')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''
  let result: Partial<BrokCodeStreamResult> = {}

  const processBlock = (block: string) => {
    const lines = block.split(/\r?\n/)
    let eventType = 'message'
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim() || 'message'
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }

    if (dataLines.length === 0) return

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>
    } catch {
      return
    }

    if (eventType === 'status') {
      const message =
        typeof payload.message === 'string' ? payload.message : null
      if (message) {
        onEvent({ type: 'status', message })
      }
      return
    }

    if (eventType === 'delta') {
      const content =
        typeof payload.content === 'string' ? payload.content : ''
      if (content) {
        accumulated += content
        onEvent({ type: 'delta', content, accumulated })
      }
      return
    }

    if (eventType === 'result') {
      result = payload as Partial<BrokCodeStreamResult>
      if (typeof result.content === 'string' && !accumulated) {
        accumulated = result.content
      }
      return
    }

    if (eventType === 'error') {
      const message =
        typeof payload.message === 'string'
          ? payload.message
          : 'BrokCode Cloud execution failed.'
      throw new Error(message)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\n\n/)
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      processBlock(block)
    }
  }

  if (buffer.trim()) {
    processBlock(buffer)
  }

  return {
    runtime:
      result?.runtime === 'opencode' ||
      result?.runtime === 'brok' ||
      result?.runtime === 'not_connected'
        ? result.runtime
        : 'brok',
    model: typeof result?.model === 'string' ? result.model : undefined,
    content:
      accumulated.trim() ||
      (typeof result?.content === 'string' ? result.content.trim() : '') ||
      'BrokCode Cloud completed the run but returned no text output.',
    usage: result?.usage,
    preview_url:
      typeof result?.preview_url === 'string' ? result.preview_url : null,
    note: typeof result?.note === 'string' ? result.note : undefined
  }
}

type BrokCodeAppProps = {
  initialPrompt?: string
  autoStart?: boolean
  connectGithub?: boolean
  accountEmail?: string
}

export function BrokCodeApp({
  initialPrompt = '',
  autoStart = false,
  connectGithub = false,
  accountEmail = 'Brok account'
}: BrokCodeAppProps = {}) {
  const cloudBootstrapRef = useRef(false)
  const pendingCloudStartPromptRef = useRef<string | null>(null)
  const runCommandRef = useRef<((command: string) => Promise<void>) | null>(
    null
  )
  const [selectedId, setSelectedId] = useState('')
  const [input, setInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [livePulse, setLivePulse] = useState(0)
  const [runHintIndex, setRunHintIndex] = useState(0)
  const [activeRuntime, setActiveRuntime] =
    useState<BrokCodeRuntime>('not_connected')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [models, setModels] = useState<BrokModel[]>([])
  const [selectedModel, setSelectedModel] = useState('brok-code')
  const [usage, setUsage] = useState<BrokUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [syncSessionId, setSyncSessionId] = useState('default')
  const [syncedSessions, setSyncedSessions] = useState<SyncedBrokCodeSession[]>(
    []
  )
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState(
    'http://127.0.0.1:3001/playground'
  )
  const [previewInput, setPreviewInput] = useState(
    'http://127.0.0.1:3001/playground'
  )
  const [previewFrameKey, setPreviewFrameKey] = useState(0)
  const [previewHealth, setPreviewHealth] = useState<PreviewHealth>({
    status: 'idle',
    message: 'Preview has not been checked yet.'
  })
  const [executionRuns, setExecutionRuns] = useState<ExecutionRun[]>([])
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [runtimeBootstrapped, setRuntimeBootstrapped] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [githubStatus, setGithubStatus] =
    useState<GithubConnectionStatus>('checking')
  const [githubMessage, setGithubMessage] = useState<string | null>(null)
  const [isConnectingGithub, setIsConnectingGithub] = useState(false)
  const [isConnectingIntegration, setIsConnectingIntegration] = useState<
    string | null
  >(null)
  const [isSubmittingPr, setIsSubmittingPr] = useState(false)
  const [repoContext, setRepoContext] = useState<GithubRepoContext | null>(null)
  const [githubRepository, setGithubRepository] = useState('')
  const [githubBaseBranch, setGithubBaseBranch] = useState('main')
  const [githubHeadBranch, setGithubHeadBranch] = useState('')
  const [versions, setVersions] = useState<BrokCodeVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [isSharing, startShareTransition] = useTransition()
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'I am Brok Code. You are signed in, so the cloud chat is ready. Connect GitHub for repo work, or add a Brok API key when you want CLI/TUI sync and external agent access.'
    }
  ])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLivePulse(value => (value + 1) % 4)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isRunning) {
      setRunHintIndex(0)
      return
    }

    const timer = window.setInterval(() => {
      setRunHintIndex(value => (value + 1) % runStreamingHints.length)
    }, 900)

    return () => window.clearInterval(timer)
  }, [isRunning])

  useEffect(() => {
    let cancelled = false

    async function bootstrapRuntime() {
      try {
        const modelsResponse = await fetch('/api/v1/models')
        if (modelsResponse.ok) {
          const body = await modelsResponse.json()
          const modelList: BrokModel[] = Array.isArray(body?.data)
            ? (body.data as BrokModel[])
            : []
          if (!cancelled) {
            const codeModels = modelList.filter(
              (model: BrokModel) => model.supports_code
            )
            setModels(codeModels)
            if (codeModels.length > 0) {
              setSelectedModel(current =>
                codeModels.some(model => model.id === current)
                  ? current
                  : codeModels[0].id
              )
            }
          }
        }
      } catch {}

      const savedKey = localStorage.getItem(BROK_KEY_STORAGE)
      const savedSessionId = getStoredSessionId()
      setSyncSessionId(savedSessionId)

      if (!savedKey || cancelled) {
        if (!cancelled) setRuntimeBootstrapped(true)
        return
      }

      if (isValidBrokApiKey(savedKey)) {
        setApiKeyInput(savedKey)
        try {
          const response = await fetch('/api/brokcode/account', {
            headers: { Authorization: `Bearer ${savedKey}` }
          })
          if (!response.ok) {
            const body = await response.json().catch(() => null)
            localStorage.removeItem(BROK_KEY_STORAGE)
            setApiKeyError(
              body?.error?.message ??
                'Saved key does not belong to this Brok account.'
            )
            setApiKeyInput('')
          } else {
            setApiKey(savedKey)
          }
        } catch {
          localStorage.removeItem(BROK_KEY_STORAGE)
          setApiKeyError('Could not validate saved Brok account key.')
          setApiKeyInput('')
        }
      } else {
        setApiKeyError('Saved key is not a Brok key. Use a brok_sk_ key.')
      }
      if (!cancelled) setRuntimeBootstrapped(true)
    }

    bootstrapRuntime()

    return () => {
      cancelled = true
    }
  }, [])

  const runtimeAgents = useMemo(
    () => createRuntimeSubagents(executionRuns),
    [executionRuns]
  )
  const selectedAgent =
    runtimeAgents.find(agent => agent.id === selectedId) ?? null
  const activeSyncSession = useMemo(
    () =>
      syncedSessions.find(session => session.id === syncSessionId) ??
      syncedSessions[0] ??
      null,
    [syncSessionId, syncedSessions]
  )

  const hasLiveKey = Boolean(apiKey && isValidBrokApiKey(apiKey))
  const hasAccountRuntime = Boolean(accountEmail)
  const hasLiveRuntime = hasLiveKey
  const maskedKey = hasLiveKey && apiKey ? maskBrokApiKey(apiKey) : null
  const codeModels =
    models.length > 0
      ? models
      : [{ id: 'brok-code', name: 'Brok Code', supports_code: true }]

  const syncSources = activeSyncSession?.sources ?? []

  const getAuthHeaders = useCallback(
    (key = apiKey): Record<string, string> => {
      return key ? { Authorization: `Bearer ${key}` } : {}
    },
    [apiKey]
  )

  const refreshGithubStatus = useCallback(async () => {
    setGithubMessage(null)
    try {
      const response = await fetch('/api/brokcode/github/status')
      const body = await response.json().catch(() => null)

      if (body?.connected) {
        setGithubStatus('connected')
        setGithubMessage('GitHub connected through Composio.')
        return true
      }

      setGithubStatus(body?.configured === false ? 'unavailable' : 'ready')
      setGithubMessage(
        typeof body?.message === 'string'
          ? body.message
          : 'Connect GitHub before BrokCode Cloud edits repositories.'
      )
      return false
    } catch (error) {
      setGithubStatus('unavailable')
      setGithubMessage(
        error instanceof Error
          ? error.message
          : 'Could not check GitHub connection.'
      )
      return false
    }
  }, [])

  const refreshSyncedSessions = useCallback(
    async (key = apiKey) => {
      if (!key || !isValidBrokApiKey(key)) {
        setSyncedSessions([])
        return
      }

      setSyncLoading(true)
      setSyncError(null)
      try {
        const response = await fetch('/api/brokcode/sessions', {
          headers: getAuthHeaders(key)
        })

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error?.message ?? 'Sync lookup failed.')
        }

        const body = await response.json()
        setSyncedSessions(
          Array.isArray(body?.sessions)
            ? (body.sessions as SyncedBrokCodeSession[])
            : []
        )
      } catch (error) {
        setSyncError(
          error instanceof Error
            ? error.message
            : 'Could not load synced sessions.'
        )
      } finally {
        setSyncLoading(false)
      }
    },
    [apiKey, getAuthHeaders]
  )

  const refreshVersions = useCallback(
    async (key = apiKey) => {
      if (!key || !isValidBrokApiKey(key)) {
        setVersions([])
        return
      }

      setVersionsLoading(true)
      try {
        const params = new URLSearchParams({ session_id: syncSessionId })
        const response = await fetch(`/api/brokcode/versions?${params}`, {
          headers: getAuthHeaders(key)
        })

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error?.message ?? 'Version lookup failed.')
        }

        const body = await response.json().catch(() => null)
        setVersions(
          Array.isArray(body?.versions)
            ? (body.versions as BrokCodeVersion[])
            : []
        )
      } catch (error) {
        setRuntimeError(
          error instanceof Error ? error.message : 'Could not load versions.'
        )
      } finally {
        setVersionsLoading(false)
      }
    },
    [apiKey, getAuthHeaders, syncSessionId]
  )

  const refreshRepoContext = useCallback(
    async (key = apiKey) => {
      if (!key || !isValidBrokApiKey(key)) {
        setRepoContext(null)
        setGithubRepository('')
        return
      }

      try {
        const response = await fetch('/api/brokcode/github/repo-context', {
          headers: getAuthHeaders(key)
        })
        const body = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(body?.error?.message ?? 'Repository lookup failed.')
        }

        const context: GithubRepoContext = {
          repository:
            typeof body?.repository === 'string' ? body.repository : null,
          remoteUrl:
            typeof body?.remoteUrl === 'string' ? body.remoteUrl : null,
          currentBranch:
            typeof body?.currentBranch === 'string' ? body.currentBranch : null,
          defaultBranch:
            typeof body?.defaultBranch === 'string'
              ? body.defaultBranch
              : 'main',
          commitSha: typeof body?.commitSha === 'string' ? body.commitSha : null
        }

        setRepoContext(context)
        if (context.repository) {
          setGithubRepository(current => current || context.repository || '')
        }
        if (context.defaultBranch) {
          setGithubBaseBranch(current =>
            current && current !== 'main'
              ? current
              : context.defaultBranch || 'main'
          )
        }
        if (context.currentBranch) {
          setGithubHeadBranch(current => current || context.currentBranch || '')
        }
      } catch (error) {
        setRepoContext(null)
        setRuntimeError(
          error instanceof Error
            ? error.message
            : 'Could not inspect local repository context.'
        )
      }
    },
    [apiKey, getAuthHeaders]
  )

  useEffect(() => {
    void refreshGithubStatus()
  }, [refreshGithubStatus])

  useEffect(() => {
    if (!apiKey) {
      setUsage(null)
      setSyncedSessions([])
      setVersions([])
      setRepoContext(null)
      return
    }

    void refreshUsage(apiKey)
    void refreshSyncedSessions(apiKey)
    void refreshVersions(apiKey)
    void refreshRepoContext(apiKey)
  }, [apiKey, refreshRepoContext, refreshSyncedSessions, refreshVersions])

  useEffect(() => {
    if (!apiKey || !isValidBrokApiKey(apiKey)) return
    void refreshVersions(apiKey)
  }, [apiKey, refreshVersions, syncSessionId])

  useEffect(() => {
    if (!apiKey || !isValidBrokApiKey(apiKey)) return

    const timer = window.setInterval(() => {
      void refreshSyncedSessions(apiKey)
    }, 5000)

    return () => window.clearInterval(timer)
  }, [apiKey, refreshSyncedSessions])

  async function appendSyncEvent({
    role,
    content,
    type,
    metadata
  }: {
    role: SyncedBrokCodeEvent['role']
    content: string
    type: string
    metadata?: Record<string, unknown>
  }) {
    if (!hasLiveKey || !apiKey) return

    try {
      const response = await fetch('/api/brokcode/sessions', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(apiKey),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: syncSessionId,
          source: 'cloud',
          role,
          type,
          title: `BrokCode ${syncSessionId}`,
          content,
          metadata
        })
      })

      if (!response.ok) return

      const body = await response.json()
      if (!body?.session) return

      setSyncedSessions(current => {
        const nextSession = body.session as SyncedBrokCodeSession
        const without = current.filter(session => session.id !== nextSession.id)
        return [nextSession, ...without].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt)
        )
      })
    } catch {}
  }

  function createExecutionRun(command: string): ExecutionRun {
    return {
      id: createId('run'),
      command,
      runtime: hasLiveRuntime ? 'opencode' : 'not_connected',
      status: 'running',
      startedAt: Date.now(),
      steps: executionStepTemplate.map(step => ({
        ...step,
        status: step.id === 'parse' ? 'running' : 'queued'
      }))
    }
  }

  function updateExecutionStep(
    runId: string,
    stepId: string,
    status: ExecutionStepStatus,
    detail?: string
  ) {
    setExecutionRuns(current =>
      current.map(run =>
        run.id === runId
          ? {
              ...run,
              steps: run.steps.map(step =>
                step.id === stepId
                  ? {
                      ...step,
                      status,
                      detail: detail ?? step.detail
                    }
                  : step
              )
            }
          : run
      )
    )
  }

  function finalizeExecutionRun(
    runId: string,
    updates: {
      runtime: BrokCodeRuntime
      status: 'done' | 'error'
      note?: string
      previewUrl?: string | null
    }
  ) {
    setExecutionRuns(current =>
      current.map(run =>
        run.id === runId
          ? {
              ...run,
              runtime: updates.runtime,
              status: updates.status,
              note: updates.note ?? run.note,
              previewUrl: updates.previewUrl ?? run.previewUrl,
              finishedAt: Date.now()
            }
          : run
      )
    )
  }

  function loadPreviewTarget(rawTarget: string) {
    const normalized = normalizePreviewUrl(rawTarget)
    if (!normalized) {
      setRuntimeError('Enter a valid preview URL (http or https).')
      return
    }
    if (isBrokCodeWorkspaceUrl(normalized)) {
      setRuntimeError(
        'Preview cannot point to /brokcode itself. Use your app URL (for example localhost:3000).'
      )
      return
    }
    setPreviewUrl(normalized)
    setPreviewInput(normalized)
    setPreviewFrameKey(value => value + 1)
    setRuntimeError(null)
  }

  function applyPreviewInput() {
    loadPreviewTarget(previewInput)
  }

  const checkPreviewHealth = useCallback(async (target = previewUrl) => {
    const normalized = normalizePreviewUrl(target)
    if (!normalized || isBrokCodeWorkspaceUrl(normalized)) {
      setPreviewHealth({
        status: 'offline',
        message: 'Choose a generated app URL, not Brok Code itself.'
      })
      return
    }

    setPreviewHealth(current => ({
      ...current,
      status: 'checking',
      message: 'Checking preview server...'
    }))

    try {
      const response = await fetch(
        `/api/brokcode/preview/status?${new URLSearchParams({
          url: normalized
        })}`,
        { cache: 'no-store' }
      )
      const body = await response.json().catch(() => null)

      setPreviewHealth({
        status: body?.ok ? 'online' : 'offline',
        message:
          typeof body?.message === 'string'
            ? body.message
            : body?.ok
              ? 'Preview server is reachable.'
              : 'Preview server is not reachable yet.',
        checkedAt:
          typeof body?.checkedAt === 'string'
            ? body.checkedAt
            : new Date().toISOString(),
        httpStatus: typeof body?.status === 'number' ? body.status : undefined
      })
    } catch {
      setPreviewHealth({
        status: 'offline',
        message: 'Preview health check failed.',
        checkedAt: new Date().toISOString()
      })
    }
  }, [previewUrl])

  function reloadPreview() {
    setPreviewFrameKey(value => value + 1)
    void checkPreviewHealth(previewUrl)
  }

  useEffect(() => {
    void checkPreviewHealth(previewUrl)
  }, [checkPreviewHealth, previewUrl])

  async function refreshUsage(key: string) {
    setUsageLoading(true)
    setRuntimeError(null)
    try {
      const response = await fetch('/api/v1/usage?period=month', {
        headers: { Authorization: `Bearer ${key}` }
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error?.message ?? 'Usage lookup failed.')
      }

      const body = await response.json()
      setUsage(body.usage as BrokUsage)
    } catch (error) {
      setRuntimeError(
        error instanceof Error ? error.message : 'Could not load usage stats.'
      )
    } finally {
      setUsageLoading(false)
    }
  }

  async function saveApiKey() {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) {
      setApiKeyError('Enter a Brok key before saving.')
      return
    }
    if (!isValidBrokApiKey(trimmed)) {
      setApiKeyError('Brok Code only accepts brok_sk_ keys.')
      return
    }

    try {
      const response = await fetch('/api/brokcode/account', {
        headers: { Authorization: `Bearer ${trimmed}` }
      })
      const body = await response.json().catch(() => null)

      if (!response.ok) {
        setApiKeyError(
          body?.error?.message ??
            'This Brok API key is not linked to your signed-in account.'
        )
        return
      }
    } catch {
      setApiKeyError('Could not validate this key against your Brok account.')
      return
    }

    localStorage.setItem(BROK_KEY_STORAGE, trimmed)
    setApiKey(trimmed)
    setApiKeyError(null)
    setRuntimeError(null)
  }

  function clearApiKey() {
    localStorage.removeItem(BROK_KEY_STORAGE)
    setApiKey(null)
    setActiveRuntime('not_connected')
    setApiKeyInput('')
    setApiKeyError(null)
    setRuntimeError(null)
    setUsage(null)
  }

  function saveSyncSessionId() {
    const normalized =
      syncSessionId.trim().replace(/[^a-zA-Z0-9._:-]/g, '-') || 'default'
    setSyncSessionId(normalized)
    localStorage.setItem(BROK_SESSION_STORAGE, normalized)
    if (apiKey) {
      void refreshSyncedSessions(apiKey)
    }
  }

  async function shareCurrentChat() {
    const transcript = messages
      .filter(message => message.role !== 'system' && message.content.trim())
      .map(message => ({
        role: message.role,
        content: message.content
      }))

    const firstUserMessage = transcript.find(entry => entry.role === 'user')
    const titleBase = firstUserMessage?.content?.trim() || 'Brok Code Chat'
    const title =
      titleBase.length > 80 ? `${titleBase.slice(0, 77)}...` : titleBase

    const portableShareUrl = createPortableShareUrl(transcript, title)

    let sharedChat: Awaited<
      ReturnType<typeof createShareableChatFromTranscript>
    > = null
    try {
      sharedChat = await createShareableChatFromTranscript(transcript, title)
    } catch {}

    const usingPortableShare = !sharedChat
    const shareUrl = sharedChat
      ? new URL(`/search/${sharedChat.id}`, window.location.origin).toString()
      : portableShareUrl

    if (usingPortableShare) {
      toast.message('Using portable share link.')
    }

    const copiedToClipboard = await safeCopyTextToClipboard(shareUrl)
    if (copiedToClipboard) {
      toast.success(
        usingPortableShare ? 'Portable share link copied' : 'Share link copied'
      )
      return
    }

    window.open(shareUrl, '_blank', 'noopener,noreferrer')
    toast.success(
      usingPortableShare
        ? 'Opened portable share link. Copy it from the address bar.'
        : 'Opened share link. Copy it from the address bar.'
    )
  }

  async function persistVersionSnapshot({
    command,
    summary,
    runtime,
    status,
    previewUrl,
    prUrl
  }: {
    command: string
    summary: string
    runtime: BrokCodeRuntime
    status: 'done' | 'error'
    previewUrl?: string | null
    prUrl?: string | null
  }) {
    if (!hasLiveKey || !apiKey) return null

    try {
      const response = await fetch('/api/brokcode/versions', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(apiKey),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: syncSessionId,
          command,
          summary:
            summary.length > 1800 ? `${summary.slice(0, 1797)}...` : summary,
          runtime,
          status,
          preview_url: previewUrl ?? null,
          branch: githubHeadBranch || repoContext?.currentBranch || null,
          commit_sha: repoContext?.commitSha || null,
          pr_url: prUrl ?? null
        })
      })

      if (!response.ok) {
        return null
      }

      const body = await response.json().catch(() => null)
      if (!body?.version) return null

      const version = body.version as BrokCodeVersion
      setVersions(current => [
        version,
        ...current.filter(v => v.id !== version.id)
      ])
      return version
    } catch {
      return null
    }
  }

  async function runPlatformChecks() {
    const checkMessages = ['Platform check summary:']
    let modelsOk = false

    try {
      const modelsResponse = await fetch('/api/v1/models')
      const modelsBody = await modelsResponse.json().catch(() => null)
      modelsOk = modelsResponse.ok && Array.isArray(modelsBody?.data)
      checkMessages.push(
        modelsOk
          ? `- Models endpoint healthy (${modelsBody.data.length} models).`
          : '- Models endpoint check failed.'
      )
    } catch {
      checkMessages.push('- Models endpoint check failed.')
    }

    if (hasLiveKey && apiKey) {
      try {
        const usageResponse = await fetch('/api/v1/usage?period=month', {
          headers: { Authorization: `Bearer ${apiKey}` }
        })
        const usageBody = await usageResponse.json().catch(() => null)
        if (usageResponse.ok) {
          checkMessages.push(
            `- Usage endpoint healthy (${usageBody?.usage?.requests ?? 0} requests this month).`
          )
        } else {
          checkMessages.push(
            `- Usage endpoint returned ${usageResponse.status}.`
          )
        }
      } catch {
        checkMessages.push('- Usage endpoint check failed.')
      }
    } else {
      checkMessages.push('- Usage endpoint skipped (no Brok key set).')
    }

    if (modelsOk) {
      checkMessages.push('- UI and API are aligned for live Brok Code calls.')
    }

    checkMessages.push(
      githubStatus === 'connected'
        ? `- GitHub connected${githubRepository ? ` (${githubRepository})` : ''}.`
        : '- GitHub not connected yet.'
    )
    checkMessages.push(
      versions.length > 0
        ? `- Version history active (${versions.length} saved versions).`
        : '- Version history is empty (run a command to create one).'
    )

    setMessages(current => [
      ...current,
      {
        id: createId('assistant'),
        role: 'assistant',
        content: checkMessages.join('\n'),
        actions: ['run-checks']
      }
    ])
  }

  async function deployBrokCodeCloud() {
    if (!hasLiveKey || !apiKey) {
      setRuntimeError('Set a valid Brok API key before deploying.')
      return
    }

    setIsDeploying(true)
    setRuntimeError(null)

    try {
      const response = await fetch('/api/brokcode/deploy', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const body = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'Deployment failed to start.')
      }

      const deploymentId =
        typeof body?.deploymentId === 'string' ? body.deploymentId : null
      const strategy =
        typeof body?.strategy === 'string' ? body.strategy : 'unknown'
      const message =
        typeof body?.message === 'string'
          ? body.message
          : 'Deployment triggered.'

      setMessages(current => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          content: `${message}\nStrategy: ${strategy}${deploymentId ? `\nDeployment ID: ${deploymentId}` : ''}`
        }
      ])
      toast.success('Deployment triggered')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Deployment failed to start.'
      setRuntimeError(message)
      toast.error(message)
    } finally {
      setIsDeploying(false)
    }
  }

  async function connectGithubForBrokCode(prompt = input) {
    setIsConnectingGithub(true)
    setRuntimeError(null)
    setGithubMessage(null)

    try {
      const response = await fetch('/api/brokcode/github/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      const body = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(body?.message ?? 'Could not start GitHub connection.')
      }

      if (typeof body?.connectionUrl === 'string' && body.connectionUrl) {
        const popup = window.open(
          body.connectionUrl,
          'brokcode-github-connect',
          'popup=yes,width=560,height=760,noopener,noreferrer'
        )

        if (!popup) {
          window.location.href = body.connectionUrl
          return
        }

        setGithubStatus('checking')
        setGithubMessage(
          'Finish GitHub authorization in the popup. Brok Code will verify access automatically.'
        )
        toast.info('Complete GitHub authorization in the popup')

        const connected = await pollIntegrationStatus(
          '/api/brokcode/github/status',
          popup
        )

        if (!popup.closed) {
          popup.close()
        }

        if (connected) {
          setGithubStatus('connected')
          setGithubMessage('GitHub connected through Composio.')
          if (apiKey) {
            void refreshRepoContext(apiKey)
          }
          toast.success('GitHub connected')
          return
        }

        const checked = await refreshGithubStatus()
        if (checked) {
          if (apiKey) {
            void refreshRepoContext(apiKey)
          }
          toast.success('GitHub connected')
          return
        }

        setGithubStatus('ready')
        setGithubMessage(
          'Connection not confirmed yet. Retry connect and keep the popup open until provider approval finishes.'
        )
        toast.error('Could not confirm GitHub connection yet')
        return
      }

      const message =
        typeof body?.message === 'string'
          ? body.message
          : 'GitHub connection link was not returned.'
      setGithubStatus('ready')
      setGithubMessage(message)
      setRuntimeError(message)
      toast.error(message)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not start GitHub connection.'
      setGithubStatus('unavailable')
      setGithubMessage(message)
      setRuntimeError(message)
      toast.error(message)
    } finally {
      setIsConnectingGithub(false)
    }
  }

  async function connectIntegrationForBrokCode(
    toolkit: string,
    prompt = input
  ) {
    const normalizedToolkit = toolkit.trim().toLowerCase()
    if (!normalizedToolkit) return

    if (normalizedToolkit === 'github') {
      await connectGithubForBrokCode(prompt)
      return
    }

    setIsConnectingIntegration(normalizedToolkit)
    setRuntimeError(null)

    try {
      const redirectUrl = `${window.location.origin}/brokcode?integration=${encodeURIComponent(
        normalizedToolkit
      )}&connected=1`
      const response = await fetch(
        `/api/integrations/${encodeURIComponent(normalizedToolkit)}/connect`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            redirectUrl
          })
        }
      )
      const body = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          body?.message ||
            `Could not start ${formatToolkitName(
              normalizedToolkit
            )} connection.`
        )
      }

      if (typeof body?.connectionUrl === 'string' && body.connectionUrl) {
        const popup = window.open(
          body.connectionUrl,
          `brokcode-integration-${normalizedToolkit}`,
          'popup=yes,width=560,height=760,noopener,noreferrer'
        )

        if (!popup) {
          window.location.href = body.connectionUrl
          return
        }

        toast.info(
          `Complete ${formatToolkitName(
            normalizedToolkit
          )} authorization in the popup`
        )

        const connected = await pollIntegrationStatus(
          `/api/integrations/${encodeURIComponent(normalizedToolkit)}/status`,
          popup
        )

        if (!popup.closed) {
          popup.close()
        }

        if (connected) {
          setMessages(current => [
            ...current,
            {
              id: createId('assistant'),
              role: 'assistant',
              content: `${formatToolkitName(
                normalizedToolkit
              )} is now connected through Composio.`
            }
          ])
          toast.success(`${formatToolkitName(normalizedToolkit)} connected`)
          return
        }

        throw new Error(
          `Could not confirm ${formatToolkitName(
            normalizedToolkit
          )} connection yet.`
        )
      }

      throw new Error(
        body?.message ||
          `${formatToolkitName(
            normalizedToolkit
          )} connection URL was not returned.`
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Could not connect ${formatToolkitName(normalizedToolkit)}.`
      setRuntimeError(message)
      toast.error(message)
    } finally {
      setIsConnectingIntegration(null)
    }
  }

  async function submitPullRequest() {
    if (!hasLiveKey || !apiKey) {
      setRuntimeError('Set a valid Brok API key before opening a PR.')
      return
    }

    if (githubStatus !== 'connected') {
      setRuntimeError('Connect GitHub before opening a PR.')
      return
    }

    const repository = githubRepository.trim()
    const head = githubHeadBranch.trim()
    const base = githubBaseBranch.trim() || 'main'

    if (!repository || !head) {
      setRuntimeError('Set repository and head branch before opening a PR.')
      return
    }

    const latestRun = executionRuns[0]
    const titleBase =
      latestRun?.command?.trim() || input.trim() || 'Brok Code update'
    const title =
      titleBase.length > 120 ? `${titleBase.slice(0, 117)}...` : titleBase
    const bodyLines = [
      'Opened by Brok Code Cloud.',
      '',
      `Repository: ${repository}`,
      `Head: ${head}`,
      `Base: ${base}`,
      latestRun?.note ? '' : null,
      latestRun?.note || null
    ].filter((line): line is string => Boolean(line))

    setIsSubmittingPr(true)
    setRuntimeError(null)

    try {
      const response = await fetch('/api/brokcode/github/pull-request', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(apiKey),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          repository,
          title,
          body: bodyLines.join('\n'),
          base,
          head,
          draft: false
        })
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? 'Failed to open pull request.'
        )
      }

      const prUrl = payload?.pullRequest?.url
      const prNumber = payload?.pullRequest?.number
      const message = prUrl
        ? `Opened PR #${prNumber ?? 'new'}: ${prUrl}`
        : 'Opened pull request successfully.'

      setMessages(current => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          content: message
        }
      ])

      if (latestRun) {
        void persistVersionSnapshot({
          command: latestRun.command,
          summary: latestRun.note || 'PR opened from Brok Code Cloud.',
          runtime: latestRun.runtime,
          status: latestRun.status === 'error' ? 'error' : 'done',
          previewUrl: latestRun.previewUrl ?? null,
          prUrl: typeof prUrl === 'string' ? prUrl : null
        })
      }

      toast.success('Pull request opened')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to open pull request.'
      setRuntimeError(message)
      setMessages(current => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          content: `PR creation failed: ${message}`
        }
      ])
      toast.error(message)
    } finally {
      setIsSubmittingPr(false)
    }
  }

  function handleChatAction(action: ChatAction, integrationToolkit?: string) {
    if (action === 'run-checks') {
      void runPlatformChecks()
      return
    }

    if (action === 'connect-github') {
      void connectGithubForBrokCode()
      return
    }

    if (action === 'connect-integration') {
      if (!integrationToolkit) {
        setRuntimeError('Choose an integration toolkit to connect.')
        return
      }
      void connectIntegrationForBrokCode(integrationToolkit)
      return
    }

    void submitPullRequest()
  }

  function focusAgent(agent: BrokCodeSubagent) {
    setSelectedId(agent.id)
    setInput(`Continue with ${agent.name}: ${agent.nextStep}`)
  }

  async function runCommand(command: string) {
    const trimmed = command.trim()
    if (!trimmed || isRunning) return

    const integrationToolkit = detectIntegrationConnectIntent(trimmed)
    if (integrationToolkit) {
      setInput('')
      setMessages(current => [
        ...current,
        { id: createId('user'), role: 'user', content: trimmed },
        {
          id: createId('assistant'),
          role: 'assistant',
          content: `Opening Composio connection for ${formatToolkitName(
            integrationToolkit
          )}.`,
          actions:
            integrationToolkit === 'github'
              ? ['connect-github']
              : ['connect-integration'],
          integrationToolkit:
            integrationToolkit === 'github' ? undefined : integrationToolkit
        }
      ])

      if (integrationToolkit === 'github') {
        void connectGithubForBrokCode(trimmed)
      } else {
        void connectIntegrationForBrokCode(integrationToolkit, trimmed)
      }
      return
    }

    if (!hasLiveKey || !apiKey) {
      setRuntimeError('Add a Brok API key before starting a real run.')
      setMessages(current => [
        ...current,
        {
          id: createId('system'),
          role: 'system',
          content:
            'Real BrokCode execution requires a signed-in Brok account and an account-owned brok_sk_ API key. Create or paste your key, then run this command again.'
        }
      ])
      return
    }

    const run = createExecutionRun(trimmed)
    const assistantMessageId = createId('assistant')
    setExecutionRuns(current => [run, ...current].slice(0, 8))
    setInput('')
    setIsRunning(true)
    setSelectedId('')
    setMessages(current => [
      ...current,
      { id: createId('user'), role: 'user', content: trimmed },
      {
        id: createId('system'),
        role: 'system',
        content: 'Starting a real BrokCode Cloud run...'
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        content: 'Connecting to brokcode-cloud runtime...'
      }
    ])
    setRuntimeError(null)
    void appendSyncEvent({
      role: 'user',
      type: 'command',
      content: trimmed,
      metadata: {
        runtime: 'cloud',
        model: selectedModel
      }
    })

    const actions: ChatAction[] =
      trimmed.toLowerCase().includes('pr') ||
      trimmed.toLowerCase().includes('github')
        ? ['run-checks', 'open-pr', 'connect-github']
        : ['run-checks']

    updateExecutionStep(
      run.id,
      'parse',
      'done',
      'Intent parsed and command accepted.'
    )
    updateExecutionStep(
      run.id,
      'plan',
      'running',
      'Preparing real runtime request.'
    )

    try {
      updateExecutionStep(run.id, 'plan', 'done', 'Runtime request prepared.')
      updateExecutionStep(
        run.id,
        'execute',
        'running',
        'Sending command to brokcode-cloud runtime.'
      )

      const response = await fetch('/api/brokcode/execute', {
        method: 'POST',
        headers: {
          ...(hasLiveKey && apiKey
            ? { Authorization: `Bearer ${apiKey}` }
            : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command: trimmed,
          model: selectedModel,
          stream: true,
          require_opencode: true,
          messages: [
            { role: 'system', content: buildCommandPrompt(trimmed) },
            { role: 'user', content: trimmed }
          ]
        })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error?.message ?? 'Live Brok request failed.')
      }

      const responseContentType = response.headers.get('content-type') ?? ''
      const body = responseContentType.includes('text/event-stream')
        ? await readBrokCodeExecutionStream(response, event => {
            if (event.type === 'status') {
              updateExecutionStep(run.id, 'execute', 'running', event.message)
              setMessages(current =>
                current.map(message =>
                  message.id === assistantMessageId &&
                  message.content.startsWith('Connecting')
                    ? {
                        ...message,
                        content: `${event.message}\n\nWaiting for the first token...`
                      }
                    : message
                )
              )
              return
            }

            setMessages(current =>
              current.map(message =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: `Live (${selectedModel})\n\n${event.accumulated}`
                    }
                  : message
              )
            )
          })
        : await response.json()
      const runtime = (body?.runtime ?? 'brok') as BrokCodeRuntime
      const content = body?.content
      const assistantContent =
        typeof content === 'string' && content.trim().length > 0
          ? content.trim()
          : 'BrokCode Cloud completed the run but returned no text output.'
      const discoveredPreviewUrl =
        typeof body?.preview_url === 'string'
          ? body.preview_url
          : extractPreviewUrlFromText(assistantContent)

      setActiveRuntime(runtime)
      updateExecutionStep(
        run.id,
        'execute',
        'done',
        runtime === 'opencode'
          ? 'Completed with brokcode-cloud runtime.'
          : 'Completed with Brok runtime.'
      )
      updateExecutionStep(
        run.id,
        'validate',
        'done',
        'Response and usage payload validated.'
      )
      updateExecutionStep(
        run.id,
        'summarize',
        'done',
        'Assistant response is ready.'
      )
      finalizeExecutionRun(run.id, {
        runtime,
        status: 'done',
        note:
          typeof body?.note === 'string'
            ? body.note
            : runtime === 'opencode'
              ? 'brokcode-cloud runtime active.'
              : 'Brok runtime active.',
        previewUrl: discoveredPreviewUrl
      })

      if (discoveredPreviewUrl) {
        const normalized = normalizePreviewUrl(discoveredPreviewUrl)
        if (normalized && !isBrokCodeWorkspaceUrl(normalized)) {
          setPreviewUrl(normalized)
          setPreviewInput(normalized)
        }
      }

      setMessages(current =>
        current.map(message =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: `Live (${selectedModel} via ${
                  runtime === 'opencode' ? 'brokcode-cloud' : 'Brok'
                })\n\n${assistantContent}`,
                actions
              }
            : message
        )
      )
      void appendSyncEvent({
        role: 'assistant',
        type: 'response',
        content: assistantContent,
        metadata: {
          runtime,
          model: selectedModel
        }
      })
      void persistVersionSnapshot({
        command: trimmed,
        summary: assistantContent,
        runtime,
        status: 'done',
        previewUrl: discoveredPreviewUrl ?? null
      })
      if (apiKey) {
        await refreshUsage(apiKey)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Live Brok request failed.'
      updateExecutionStep(run.id, 'execute', 'error', message)
      updateExecutionStep(
        run.id,
        'validate',
        'error',
        'Runtime response could not be validated.'
      )
      updateExecutionStep(
        run.id,
        'summarize',
        'error',
        'No generated placeholder output was used.'
      )
      finalizeExecutionRun(run.id, {
        runtime: 'brok',
        status: 'error',
        note: 'Real runtime failed. No generated placeholder output was produced.'
      })
      setRuntimeError(message)
      setMessages(current =>
        current.map(existing =>
          existing.id === assistantMessageId
            ? {
                ...existing,
                content: `Real run failed: ${message}\n\nNo generated placeholder output was produced.`,
                actions
              }
            : existing
        )
      )
      void appendSyncEvent({
        role: 'assistant',
        type: 'error',
        content: message,
        metadata: {
          runtime: 'error',
          model: selectedModel
        }
      })
      void persistVersionSnapshot({
        command: trimmed,
        summary: message,
        runtime: 'brok',
        status: 'error',
        previewUrl: null
      })
    } finally {
      setIsRunning(false)
    }
  }

  runCommandRef.current = runCommand

  useEffect(() => {
    if (!runtimeBootstrapped) return
    if (cloudBootstrapRef.current) return

    const prompt = initialPrompt.trim()
    if (!prompt) return

    cloudBootstrapRef.current = true
    setInput(prompt)

    if (connectGithub) {
      setMessages(current => [
        ...current,
        {
          id: createId('system'),
          role: 'system',
          content:
            'GitHub mode is requested for this build. Connect GitHub, choose the repo, then BrokCode Cloud can work from the live repository context.',
          actions: ['connect-github']
        }
      ])
    }

    if (autoStart) {
      if (connectGithub && githubStatus !== 'connected') {
        pendingCloudStartPromptRef.current = prompt
        setMessages(current => [
          ...current,
          {
            id: createId('system'),
            role: 'system',
            content:
              'BrokCode Cloud is ready to start after GitHub is connected. Use Connect GitHub, choose the repo, then the coding agent can run against the live repository.',
            actions: ['connect-github']
          }
        ])
        return
      }

      if (!hasLiveKey) {
        pendingCloudStartPromptRef.current = prompt
        setMessages(current => [
          ...current,
          {
            id: createId('system'),
            role: 'system',
            content:
              'BrokCode Cloud is queued. Sign in and add an account-owned Brok API key to start this cloud run.',
            actions: ['connect-github']
          }
        ])
        return
      }

      window.setTimeout(() => {
        void runCommandRef.current?.(
          buildCloudStartCommand(prompt, connectGithub)
        )
      }, 350)
    }
  }, [
    autoStart,
    connectGithub,
    githubStatus,
    hasLiveKey,
    hasLiveRuntime,
    initialPrompt,
    runtimeBootstrapped
  ])

  useEffect(() => {
    if (!hasLiveKey || !hasLiveRuntime || isRunning) return
    if (connectGithub && githubStatus !== 'connected') return

    const prompt = pendingCloudStartPromptRef.current
    if (!prompt) return

    pendingCloudStartPromptRef.current = null
    void runCommandRef.current?.(buildCloudStartCommand(prompt, connectGithub))
  }, [connectGithub, githubStatus, hasLiveKey, hasLiveRuntime, isRunning])

  return (
    <div className="dashboard-shell brokcode-shell flex h-full w-full flex-col pt-12 text-foreground">
      <header className="dashboard-panel sticky top-0 z-20 mx-3 border-b px-3 py-3 sm:mx-4 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md border bg-muted shadow-[0_16px_36px_-22px_rgba(99,102,241,0.45)]">
              <Code2 className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold sm:text-xl">
                  Brok Code
                </h1>
                <Badge variant="secondary" className="rounded-md text-[11px]">
                  Lovable-style builder
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground sm:truncate">
                Chat-first app builder on the left, live preview and runtime
                controls on the right.
              </p>
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                Runtime and fallback state stay visible
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex items-center rounded-md border border-border/70 bg-card/45 p-0.5 backdrop-blur-sm">
              <Button size="sm" className="h-7 rounded-sm px-2.5 text-xs">
                Cloud
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 rounded-sm px-2.5 text-xs"
              >
                <Link href="/brokcode/tui">TUI</Link>
              </Button>
            </div>
            <Badge variant="outline" className="hidden rounded-md sm:flex">
              {executionRuns.length} real runs
            </Badge>
            <Badge
              variant={hasLiveRuntime ? 'default' : 'secondary'}
              className="rounded-md"
            >
              {hasLiveKey
                ? 'Account key'
                : hasAccountRuntime
                  ? 'Key required'
                  : 'Sign in required'}
            </Badge>
            <Badge variant="outline" className="rounded-md">
              Sync:{' '}
              {syncSources.includes('cloud') && syncSources.includes('tui')
                ? 'Cloud + TUI'
                : syncSources.includes('tui')
                  ? 'TUI'
                  : syncSources.includes('cloud')
                    ? 'Cloud'
                    : syncSessionId}
            </Badge>
            <Badge
              variant={githubStatus === 'connected' ? 'default' : 'secondary'}
              className="rounded-md"
            >
              GitHub:{' '}
              {githubStatus === 'checking'
                ? 'Checking'
                : githubStatus === 'connected'
                  ? 'Connected'
                  : githubStatus === 'ready'
                    ? 'Connect'
                    : 'Unavailable'}
            </Badge>
            {isConnectingIntegration && (
              <Badge variant="secondary" className="rounded-md">
                Connecting {formatToolkitName(isConnectingIntegration)}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 sm:w-auto"
              disabled={
                isConnectingGithub ||
                Boolean(isConnectingIntegration) ||
                githubStatus === 'connected'
              }
              onClick={() => handleChatAction('connect-github')}
            >
              {isConnectingGithub ? (
                <RefreshCcw className="size-4 animate-spin" />
              ) : (
                <Github className="size-4" />
              )}
              {githubStatus === 'connected'
                ? 'GitHub Connected'
                : isConnectingGithub
                  ? 'Connecting...'
                  : 'Connect GitHub'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 sm:w-auto"
              disabled={isSharing}
              onClick={() => {
                startShareTransition(() => {
                  void shareCurrentChat()
                })
              }}
            >
              {isSharing ? (
                <RefreshCcw className="size-4 animate-spin" />
              ) : (
                <Share2 className="size-4" />
              )}
              {isSharing ? 'Sharing...' : 'Share Chat'}
            </Button>
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 px-3 pb-3 sm:px-4 sm:pb-4 sm:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:grid-cols-[minmax(340px,430px)_minmax(0,1fr)] xl:grid-cols-[minmax(380px,480px)_minmax(0,1fr)]">
        <section className="dashboard-rail flex min-h-0 flex-col border sm:border-r sm:rounded-l-xl">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5">
            <div className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-md border bg-background p-3">
                <div className="pointer-events-none -mx-3 -mt-3 mb-3 h-px bg-gradient-to-r from-transparent via-primary/65 to-transparent" />
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Build from a prompt</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Describe the app you want like Lovable. BrokCode runs it
                      through the configured runtime and keeps errors visible
                      when execution fails.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {runStreamingHints.slice(0, 3).map(hint => (
                        <span
                          key={hint}
                          className="rounded-full border border-border/60 bg-muted/25 px-2 py-1 text-[11px] text-muted-foreground"
                        >
                          {hint}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <details className="group rounded-md border bg-background p-3 sm:p-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                  Runtime setup
                  <span className="text-xs font-normal text-muted-foreground">
                    {accountEmail}
                  </span>
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-end">
                    <div>
                      <Label htmlFor="brok-code-key" className="text-xs">
                      Brok account API key
                      <span className="ml-1 font-normal text-muted-foreground">
                        optional for CLI/TUI
                      </span>
                      </Label>
                      <div className="mt-1 flex items-center gap-2">
                        <KeyRound className="size-4 text-muted-foreground" />
                        <Input
                          id="brok-code-key"
                          value={apiKeyInput}
                          onChange={event => {
                            setApiKeyInput(event.target.value)
                            if (apiKeyError) setApiKeyError(null)
                          }}
                          placeholder="brok_sk_live_..."
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Model</Label>
                      <Select
                        value={selectedModel}
                        onValueChange={setSelectedModel}
                      >
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {codeModels.map(model => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" className="h-9" onClick={saveApiKey}>
                      Save Key
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={clearApiKey}
                      disabled={!apiKeyInput}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">Runtime</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        disabled={!hasLiveKey || !apiKey || usageLoading}
                        onClick={() => {
                          if (apiKey) void refreshUsage(apiKey)
                        }}
                      >
                        <RefreshCcw className="size-3.5" />
                        <span className="sr-only">Refresh usage</span>
                      </Button>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {maskedKey
                        ? `Using ${maskedKey}`
                        : `Using signed-in account (${accountEmail})`}
                    </p>
                    {usageLoading ? (
                      <p className="mt-1 text-muted-foreground">
                        Refreshing usage...
                      </p>
                    ) : usage ? (
                      <p className="mt-1 text-muted-foreground">
                        {usage.requests} req,{' '}
                        {usage.input_tokens + usage.output_tokens} tokens, $
                        {usage.billed_usd.toFixed(4)}
                      </p>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        Usage unavailable
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 rounded-md border bg-muted/20 p-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div>
                      <Label htmlFor="brok-code-session" className="text-xs">
                        Shared Cloud/TUI Session
                      </Label>
                      <Input
                        id="brok-code-session"
                        value={syncSessionId}
                        onChange={event => setSyncSessionId(event.target.value)}
                        onBlur={saveSyncSessionId}
                        placeholder="default"
                        className="mt-1 h-9"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2"
                        onClick={saveSyncSessionId}
                      >
                        <Globe className="size-4" />
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2"
                        disabled={!hasLiveKey || syncLoading}
                        onClick={() => {
                          void refreshSyncedSessions()
                        }}
                      >
                        <RefreshCcw
                          className={cn(
                            'size-4',
                            syncLoading && 'animate-spin'
                          )}
                        />
                        Sync
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Use the same value in terminal with{' '}
                    <code>BROKCODE_SESSION_ID={syncSessionId}</code> so cloud
                    and TUI runs appear together.
                  </p>
                  {syncError && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      {syncError}
                    </p>
                  )}
                  {githubMessage && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {githubMessage}
                    </p>
                  )}
                </div>
                <div className="mt-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium">
                        GitHub PR Repository
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Used by Open PR so Brok Code can publish directly.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={!hasLiveKey}
                      onClick={() => {
                        if (apiKey) {
                          void refreshRepoContext(apiKey)
                        }
                      }}
                    >
                      <RefreshCcw className="size-3.5" />
                      Detect
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <Label htmlFor="brok-github-repo" className="text-xs">
                        Repository
                      </Label>
                      <Input
                        id="brok-github-repo"
                        value={githubRepository}
                        onChange={event =>
                          setGithubRepository(event.target.value)
                        }
                        placeholder="owner/repo"
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label htmlFor="brok-github-base" className="text-xs">
                        Base
                      </Label>
                      <Input
                        id="brok-github-base"
                        value={githubBaseBranch}
                        onChange={event =>
                          setGithubBaseBranch(event.target.value)
                        }
                        placeholder="main"
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <Label htmlFor="brok-github-head" className="text-xs">
                      Head Branch
                    </Label>
                    <Input
                      id="brok-github-head"
                      value={githubHeadBranch}
                      onChange={event =>
                        setGithubHeadBranch(event.target.value)
                      }
                      placeholder="feature/my-branch"
                      className="mt-1 h-9"
                    />
                  </div>
                  {repoContext?.remoteUrl && (
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      Remote: {repoContext.remoteUrl}
                    </p>
                  )}
                  {repoContext?.commitSha && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      HEAD: {repoContext.commitSha.slice(0, 10)}
                    </p>
                  )}
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-2"
                      onClick={() => {
                        void submitPullRequest()
                      }}
                      disabled={
                        !hasLiveKey ||
                        isSubmittingPr ||
                        githubStatus !== 'connected'
                      }
                    >
                      {isSubmittingPr ? (
                        <RefreshCcw className="size-4 animate-spin" />
                      ) : (
                        <Rocket className="size-4" />
                      )}
                      {isSubmittingPr ? 'Opening PR...' : 'Open PR'}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      void deployBrokCodeCloud()
                    }}
                    disabled={!hasLiveKey || isDeploying}
                  >
                    {isDeploying ? (
                      <RefreshCcw className="size-4 animate-spin" />
                    ) : (
                      <Rocket className="size-4" />
                    )}
                    {isDeploying ? 'Deploying...' : '1-Click Deploy'}
                  </Button>
                  <p className="self-center text-xs text-muted-foreground">
                    Triggers brokcode-cloud deployment on Railway.
                  </p>
                </div>
                {(apiKeyError || runtimeError) && (
                  <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">
                    {apiKeyError ?? runtimeError}
                  </p>
                )}
              </details>

              <div className="rounded-md border bg-background p-3 sm:hidden">
                <Tabs defaultValue="visualizer">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        brokcode-cloud Runtime Workspace
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Watch execution lanes and live browser preview.
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit rounded-md">
                      Runtime:{' '}
                      {activeRuntime === 'opencode'
                        ? 'brokcode-cloud'
                        : activeRuntime === 'brok'
                          ? 'Brok'
                          : 'Not connected'}
                    </Badge>
                  </div>

                  <TabsList className="mt-3 h-9 w-full justify-start rounded-md">
                    <TabsTrigger
                      value="visualizer"
                      className="gap-1.5 rounded-sm"
                    >
                      <Activity className="size-4" />
                      Visualizer
                    </TabsTrigger>
                    <TabsTrigger value="browser" className="gap-1.5 rounded-sm">
                      <Monitor className="size-4" />
                      Browser Preview
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="visualizer" className="mt-3">
                    <ExecutionVisualizer runs={executionRuns} />
                  </TabsContent>

                  <TabsContent value="browser" className="mt-3">
                    <BrowserPreviewPanel
                      previewInput={previewInput}
                      previewUrl={previewUrl}
                      previewFrameKey={previewFrameKey}
                      previewHealth={previewHealth}
                      onPreviewInputChange={setPreviewInput}
                      onApply={applyPreviewInput}
                      onDirectLoad={loadPreviewTarget}
                      onReload={reloadPreview}
                      runtimeError={runtimeError}
                      latestRun={executionRuns[0]}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              <div className="sm:hidden">
                <SyncedSessionPanel
                  session={activeSyncSession}
                  sessionId={syncSessionId}
                  loading={syncLoading}
                  onRefresh={() => {
                    void refreshSyncedSessions()
                  }}
                />
              </div>

              <div className="sm:hidden">
                <VersionHistoryPanel
                  versions={versions}
                  loading={versionsLoading}
                  onRefresh={() => {
                    if (apiKey) {
                      void refreshVersions(apiKey)
                    }
                  }}
                />
              </div>

              <div className="rounded-md border bg-muted/20 p-3 sm:hidden">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Runtime agents</p>
                    <p className="text-xs text-muted-foreground">
                      Real agent details appear after the runtime reports them.
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-md">
                    {runtimeAgents.length}
                  </Badge>
                </div>
                <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                  {runtimeAgents.map(agent => (
                    <button
                      key={agent.id}
                      className={cn(
                        'min-w-[220px] snap-start rounded-md border bg-background p-3 text-left transition-colors',
                        selectedId === agent.id
                          ? 'border-foreground shadow-sm'
                          : 'hover:bg-accent/40'
                      )}
                      onClick={() => setSelectedId(agent.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {agent.name}
                        </span>
                        <span
                          className={cn(
                            'size-2 rounded-full',
                            statusTone(agent.status)
                          )}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {agent.role}
                      </p>
                      <p className="mt-2 line-clamp-2 text-xs">
                        {agent.currentTask}
                      </p>
                    </button>
                  ))}
                </div>
                {selectedAgent ? (
                  <div className="mt-3">
                    <SubagentDetail
                      agent={selectedAgent}
                      livePulse={livePulse}
                      onFocus={focusAgent}
                    />
                  </div>
                ) : (
                  <p className="mt-3 rounded-md border bg-background p-3 text-xs text-muted-foreground">
                    No real subagent events reported yet.
                  </p>
                )}
              </div>

              {messages.map(message => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  runtimeAgents={runtimeAgents}
                  onAgentClick={setSelectedId}
                  onAction={handleChatAction}
                  selectedId={selectedId ?? ''}
                />
              ))}

              {isRunning && (
                <div className="mr-auto max-w-[min(100%,42rem)] overflow-hidden rounded-md border bg-muted/30 p-4 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.28)]">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wand2 className="size-4" />
                    <span>Brok Code is working</span>
                    <span className="typing-dots" aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="thinking-text">
                      {runStreamingHints[runHintIndex]}
                    </span>
                  </p>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-background/70">
                    <div className="h-full w-2/5 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-zinc-950/80 dark:bg-white/80" />
                  </div>
                  <div className="mt-3">
                    <ExecutionVisualizer runs={executionRuns.slice(0, 1)} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t bg-background p-3 sm:p-4">
            <div className="w-full">
              <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
                {brokCodeCommands.map(command => (
                  <button
                    key={command}
                    className="shrink-0 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => runCommand(command)}
                    disabled={isRunning}
                  >
                    {command}
                  </button>
                ))}
              </div>

              <form
                className="relative flex items-end gap-2 overflow-hidden rounded-md border bg-background p-2 shadow-sm"
                onSubmit={event => {
                  event.preventDefault()
                  runCommand(input)
                }}
              >
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
                <Textarea
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      runCommand(input)
                    }
                  }}
                  placeholder="Ask Brok Code to build, fix, audit, or ship..."
                  className="max-h-36 min-h-12 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isRunning || !input.trim()}
                >
                  <Send className="size-4" />
                  <span className="sr-only">Send</span>
                </Button>
              </form>
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 border-l bg-muted/20 sm:flex sm:flex-col">
          <div className="border-b p-3">
            <Tabs defaultValue="browser">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">External Preview</p>
                  <p className="text-xs text-muted-foreground">
                    Load a running app URL next to the execution visualizer.
                  </p>
                </div>
                <Badge variant="outline" className="rounded-md">
                  {activeRuntime === 'opencode'
                    ? 'brokcode-cloud'
                    : activeRuntime === 'brok'
                      ? 'Brok'
                      : 'Not connected'}
                </Badge>
              </div>
              <TabsList className="mt-3 h-9 w-full justify-start rounded-md">
                <TabsTrigger value="browser" className="gap-1.5 rounded-sm">
                  <Monitor className="size-4" />
                  Browser
                </TabsTrigger>
                <TabsTrigger value="visualizer" className="gap-1.5 rounded-sm">
                  <Activity className="size-4" />
                  Visualizer
                </TabsTrigger>
              </TabsList>
              <TabsContent value="browser" className="mt-3">
                <BrowserPreviewPanel
                  previewInput={previewInput}
                  previewUrl={previewUrl}
                  previewFrameKey={previewFrameKey}
                  previewHealth={previewHealth}
                  onPreviewInputChange={setPreviewInput}
                  onApply={applyPreviewInput}
                  onDirectLoad={loadPreviewTarget}
                  onReload={reloadPreview}
                  runtimeError={runtimeError}
                  latestRun={executionRuns[0]}
                />
              </TabsContent>
              <TabsContent value="visualizer" className="mt-3">
                <ExecutionVisualizer runs={executionRuns} />
              </TabsContent>
            </Tabs>
          </div>

          <div className="border-b p-3">
            <SyncedSessionPanel
              session={activeSyncSession}
              sessionId={syncSessionId}
              loading={syncLoading}
              onRefresh={() => {
                void refreshSyncedSessions()
              }}
            />
          </div>

          <div className="border-b p-3">
            <VersionHistoryPanel
              versions={versions}
              loading={versionsLoading}
              onRefresh={() => {
                if (apiKey) {
                  void refreshVersions(apiKey)
                }
              }}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Runtime Agents</p>
                  <p className="text-xs text-muted-foreground">
                    Real agent details appear only when the runtime reports
                    them.
                  </p>
                </div>
                <Badge variant="outline" className="rounded-md">
                  {runtimeAgents.length}
                </Badge>
              </div>
              <div className="mt-3 grid gap-2">
                {runtimeAgents.map(agent => (
                  <SubagentCard
                    key={agent.id}
                    agent={agent}
                    livePulse={livePulse}
                    selected={agent.id === selectedAgent?.id}
                    onSelect={() => setSelectedId(agent.id)}
                  />
                ))}
              </div>
              {runtimeAgents.length === 0 && (
                <p className="mt-3 rounded-md border bg-background p-3 text-xs text-muted-foreground">
                  No real subagent events reported yet.
                </p>
              )}
            </div>

            {selectedAgent && (
              <SubagentDetail
                agent={selectedAgent}
                livePulse={livePulse}
                onFocus={focusAgent}
              />
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}

function SyncedSessionPanel({
  session,
  sessionId,
  loading,
  onRefresh
}: {
  session: SyncedBrokCodeSession | null
  sessionId: string
  loading: boolean
  onRefresh: () => void
}) {
  const events = session?.events.slice(-6).reverse() ?? []

  return (
    <div className="rounded-md border bg-background p-3 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.45)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Cloud/TUI Sync</p>
          <p className="truncate text-xs text-muted-foreground">
            Session <code>{session?.id ?? sessionId}</code>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCcw className={cn('size-4', loading && 'animate-spin')} />
          <span className="sr-only">Refresh sync</span>
        </Button>
      </div>

      {session ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {session.sources.map(source => (
              <Badge key={source} variant="secondary" className="rounded-md">
                {source === 'tui'
                  ? 'Terminal TUI'
                  : source === 'cloud'
                    ? 'BrokCode Cloud'
                    : 'API'}
              </Badge>
            ))}
            <Badge variant="outline" className="rounded-md">
              {session.events.length} events
            </Badge>
          </div>
          <div className="mt-3 space-y-2">
            {events.map(event => (
              <div key={event.id} className="rounded-md border bg-muted/20 p-2 transition-colors hover:bg-muted/30">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>
                    {event.source === 'tui' ? 'Terminal' : 'Cloud'} ·{' '}
                    {event.role}
                  </span>
                  <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-xs">{event.content}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          No synced events yet. Start the terminal with the same session id, or
          run a cloud command after saving a Brok API key.
        </p>
      )}
    </div>
  )
}

function VersionHistoryPanel({
  versions,
  loading,
  onRefresh
}: {
  versions: BrokCodeVersion[]
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <div className="rounded-md border bg-background p-3 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.45)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Version History</p>
          <p className="text-xs text-muted-foreground">
            Stored snapshots from BrokCode Cloud runs.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCcw className={cn('size-4', loading && 'animate-spin')} />
          <span className="sr-only">Refresh versions</span>
        </Button>
      </div>

      {versions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {versions.slice(0, 6).map(version => (
            <div
              key={version.id}
              className="rounded-md border bg-muted/20 p-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-1 font-medium">{version.command}</p>
                <Badge
                  variant={version.status === 'done' ? 'secondary' : 'outline'}
                  className="rounded-md text-[10px]"
                >
                  {version.status}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-muted-foreground">
                {version.summary}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>{new Date(version.createdAt).toLocaleTimeString()}</span>
                {version.runtime && <span>· {version.runtime}</span>}
                {version.branch && <span>· {version.branch}</span>}
                {version.commitSha && (
                  <span>· {version.commitSha.slice(0, 8)}</span>
                )}
                {version.prUrl && (
                  <a
                    href={version.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    <ExternalLink className="size-3" />
                    PR
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
          No versions yet. Run a command and Brok Code will store the result.
        </p>
      )}
    </div>
  )
}

function ChatBubble({
  message,
  runtimeAgents,
  onAgentClick,
  onAction,
  selectedId
}: {
  message: ChatMessage
  runtimeAgents: BrokCodeSubagent[]
  onAgentClick: (id: string) => void
  onAction: (action: ChatAction, integrationToolkit?: string) => void
  selectedId: string
}) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const agents = (message.agentIds ?? [])
    .map(id => runtimeAgents.find(agent => agent.id === id))
    .filter((agent): agent is BrokCodeSubagent => Boolean(agent))

  return (
    <article
      className={cn(
        'flex gap-2 sm:gap-3',
        isUser ? 'justify-end' : 'justify-start',
        isSystem && 'justify-center'
      )}
    >
      {!isUser && !isSystem && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted">
          <Bot className="size-4" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[min(100%,42rem)] rounded-md border p-3 text-sm leading-6 shadow-[0_16px_44px_-34px_rgba(15,23,42,0.45)] sm:p-4',
          isUser && 'bg-primary text-primary-foreground',
          isSystem &&
            'border-dashed bg-muted/30 py-2 text-xs text-muted-foreground',
          !isUser &&
            !isSystem &&
            'bg-background'
        )}
      >
        {!isUser && !isSystem && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/25 px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-zinc-900 dark:bg-zinc-100" />
            Brok Code
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>

        {agents.length > 0 && !isSystem && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {agents.map(agent => (
              <button
                key={agent.id}
                className={cn(
                  'rounded-md border bg-muted/30 p-2 text-left transition-colors hover:bg-accent',
                  selectedId === agent.id && 'border-foreground'
                )}
                onClick={() => onAgentClick(agent.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{agent.name}</span>
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      statusTone(agent.status)
                    )}
                  />
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {agent.currentTask}
                </p>
              </button>
            ))}
          </div>
        )}

        {message.actions && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {message.actions.includes('run-checks') && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 sm:w-auto"
                onClick={() => onAction('run-checks')}
              >
                <CheckCircle2 className="size-4" />
                Run Checks
              </Button>
            )}
            {message.actions.includes('open-pr') && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 sm:w-auto"
                onClick={() => onAction('open-pr')}
              >
                <Rocket className="size-4" />
                Open PR
              </Button>
            )}
            {message.actions.includes('connect-github') && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 sm:w-auto"
                onClick={() => onAction('connect-github')}
              >
                <Github className="size-4" />
                Connect GitHub
              </Button>
            )}
            {message.actions.includes('connect-integration') &&
              message.integrationToolkit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 sm:w-auto"
                  onClick={() =>
                    onAction('connect-integration', message.integrationToolkit)
                  }
                >
                  <PlugZap className="size-4" />
                  Connect {formatToolkitName(message.integrationToolkit)}
                </Button>
              )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-primary text-primary-foreground">
          <User className="size-4" />
        </div>
      )}
    </article>
  )
}

function ExecutionVisualizer({ runs }: { runs: ExecutionRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        No runs yet. Send a command to watch the execution graph.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {runs.slice(0, 4).map(run => (
        <div key={run.id} className="rounded-md border bg-muted/10 p-3 shadow-[0_14px_36px_-30px_rgba(15,23,42,0.45)]">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{run.command}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(run.startedAt).toLocaleTimeString()} -{' '}
                {run.status === 'running'
                  ? 'Running'
                  : run.status === 'done'
                    ? 'Completed'
                    : 'Needs attention'}
              </p>
            </div>
            <Badge
              variant={run.runtime === 'opencode' ? 'default' : 'outline'}
              className="rounded-md"
            >
              {run.runtime === 'opencode'
                ? 'brokcode-cloud'
                : run.runtime === 'brok'
                  ? 'Brok'
                  : 'Not connected'}
            </Badge>
          </div>

          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                run.status === 'error'
                  ? 'bg-rose-500'
                  : run.status === 'done'
                    ? 'bg-emerald-500'
                    : 'animate-pulse bg-cyan-500'
              )}
              style={{
                width: `${Math.max(
                  18,
                  Math.round(
                    (run.steps.reduce((total, step) => {
                      if (step.status === 'done') return total + 1
                      if (step.status === 'running') return total + 0.55
                      return total
                    }, 0) /
                      Math.max(run.steps.length, 1)) *
                      100
                  )
                )}%`
              }}
            />
          </div>

          <div className="space-y-2">
            {run.steps.map(step => (
              <div key={`${run.id}-${step.id}`} className="grid gap-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        step.status === 'done'
                          ? 'bg-emerald-500'
                          : step.status === 'running'
                            ? 'bg-cyan-500 animate-pulse'
                            : step.status === 'error'
                              ? 'bg-rose-500'
                              : 'bg-muted-foreground/40'
                      )}
                    />
                    <span className="font-medium">{step.label}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {step.status === 'done'
                      ? 'done'
                      : step.status === 'running'
                        ? 'running'
                        : step.status === 'error'
                          ? 'error'
                          : 'queued'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </div>

          {run.note && (
            <p className="mt-2 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
              {run.note}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function BrowserPreviewPanel({
  previewInput,
  previewUrl,
  previewFrameKey,
  previewHealth,
  latestRun,
  onPreviewInputChange,
  onApply,
  onDirectLoad,
  onReload,
  runtimeError
}: {
  previewInput: string
  previewUrl: string
  previewFrameKey: number
  previewHealth: PreviewHealth
  latestRun?: ExecutionRun
  onPreviewInputChange: (value: string) => void
  onApply: () => void
  onDirectLoad: (value: string) => void
  onReload: () => void
  runtimeError: string | null
}) {
  const previewShortcuts = [
    { label: 'localhost:3000', value: 'http://localhost:3000' },
    { label: 'localhost:5173', value: 'http://localhost:5173' },
    { label: '127.0.0.1:8080', value: 'http://127.0.0.1:8080' },
    { label: 'Playground', value: 'http://127.0.0.1:3001/playground' }
  ]
  const isBlockedPreview = isBrokCodeWorkspaceUrl(previewUrl)
  const healthTone =
    previewHealth.status === 'online'
      ? 'default'
      : previewHealth.status === 'checking'
        ? 'secondary'
        : 'outline'

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-background px-3 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">External Preview URL</p>
            <p className="text-xs text-muted-foreground">
              Points at your running app server. HMR is shown only when that
              server provides it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={healthTone} className="rounded-md">
              {previewHealth.status === 'online'
                ? 'Live'
                : previewHealth.status === 'checking'
                  ? 'Checking'
                  : previewHealth.status === 'offline'
                    ? 'Offline'
                    : 'Ready'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={onReload}
            >
              <RefreshCcw className="size-3.5" />
              Reload Preview
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {previewHealth.message}
          {previewHealth.httpStatus ? ` (${previewHealth.httpStatus})` : ''}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={previewInput}
          onChange={event => onPreviewInputChange(event.target.value)}
          placeholder="http://127.0.0.1:3001"
          className="h-9"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2"
          onClick={onApply}
        >
          <Eye className="size-4" />
          Load
        </Button>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {previewShortcuts.map(shortcut => (
          <button
            key={shortcut.label}
            className="shrink-0 rounded-md border bg-muted/20 px-2.5 py-1 text-xs transition-colors hover:bg-accent"
            onClick={() => onDirectLoad(shortcut.value)}
          >
            {shortcut.label}
          </button>
        ))}
      </div>

      {runtimeError && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
          {runtimeError}
        </p>
      )}

      {latestRun?.previewUrl && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
          <Globe className="size-3.5" />
          Suggested from last run:
          <button
            className="truncate text-foreground underline"
            onClick={() => onDirectLoad(latestRun.previewUrl ?? previewInput)}
          >
            {latestRun.previewUrl}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-md border bg-background shadow-[0_16px_44px_-32px_rgba(15,23,42,0.45)]">
        <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs">
          <span className="truncate text-muted-foreground">{previewUrl}</span>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline"
          >
            <ExternalLink className="size-3.5" />
            Open
          </a>
        </div>
        {isBlockedPreview ? (
          <div className="flex h-[360px] min-h-[360px] w-full items-center justify-center bg-muted/20 px-6 text-center text-sm text-muted-foreground lg:h-[calc(100vh-22rem)] lg:min-h-[420px]">
            BrokCode preview cannot render the BrokCode app itself. Load your
            generated app URL instead.
          </div>
        ) : (
          <iframe
            key={previewFrameKey}
            src={previewUrl}
            title="Brok Code browser preview"
            className="h-[360px] min-h-[360px] w-full bg-white lg:h-[calc(100vh-22rem)] lg:min-h-[420px]"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
    </div>
  )
}

function SubagentCard({
  agent,
  livePulse,
  selected,
  onSelect
}: {
  agent: BrokCodeSubagent
  livePulse: number
  selected: boolean
  onSelect: () => void
}) {
  const StatusIcon = statusMeta[agent.status].icon
  const isActive = agent.status === 'running' && livePulse % 2 === 0

  return (
    <button
      className={cn(
        'w-full rounded-md border bg-background p-3 text-left transition-all hover:border-foreground/30 hover:bg-accent/40',
        selected && 'border-foreground shadow-sm'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-md border',
              accentStyles[agent.accent]
            )}
          >
            <Bot className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">{agent.name}</p>
              <span
                className={cn(
                  'size-2 rounded-full',
                  statusTone(agent.status),
                  isActive && 'animate-pulse'
                )}
              />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {agent.role}
            </p>
          </div>
        </div>
        <StatusIcon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-2 line-clamp-2 text-xs">{agent.currentTask}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', statusTone(agent.status))}
          style={{ width: `${agent.progress}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{statusMeta[agent.status].label}</span>
        <span>{agent.progress}%</span>
      </div>
    </button>
  )
}

function SubagentDetail({
  agent,
  livePulse,
  onFocus
}: {
  agent: BrokCodeSubagent
  livePulse: number
  onFocus: (agent: BrokCodeSubagent) => void
}) {
  const StatusIcon = statusMeta[agent.status].icon
  const liveDots = '.'.repeat(livePulse)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-0 lg:p-4">
      <div className="rounded-md border bg-background">
        <div className="border-b p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-md border',
                  accentStyles[agent.accent]
                )}
              >
                <Bot className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{agent.name}</h2>
                <p className="text-sm text-muted-foreground">{agent.role}</p>
              </div>
            </div>
            <Badge variant="secondary" className="gap-1 rounded-md">
              <StatusIcon className="size-3.5" />
              {statusMeta[agent.status].label}
            </Badge>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Current progress</span>
              <span>{agent.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', statusTone(agent.status))}
                style={{ width: `${agent.progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 p-3 sm:p-4">
          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Zap className="size-4" />
              Doing Now
            </div>
            <p className="rounded-md border bg-muted/30 p-3 text-sm leading-6">
              {agent.currentTask}
              {agent.status === 'running' ? liveDots : ''}
            </p>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <TerminalSquare className="size-4" />
              Activity Log
            </div>
            <div className="space-y-2">
              {agent.events.map(event => (
                <div
                  key={`${event.time}-${event.label}`}
                  className="flex gap-3"
                >
                  <span className="w-10 shrink-0 pt-0.5 text-xs text-muted-foreground">
                    {event.time}
                  </span>
                  <div className="min-w-0 rounded-md border bg-background p-2">
                    <p className="text-xs font-medium">{event.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {event.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <FileCode2 className="size-4" />
              Files Touched
            </div>
            <div className="space-y-1">
              {agent.files.map(file => (
                <div
                  key={file}
                  className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs"
                >
                  <Braces className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{file}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <ListChecks className="size-4" />
              Tools
            </div>
            <div className="flex flex-wrap gap-2">
              {agent.tools.map(tool => (
                <Badge key={tool} variant="outline" className="rounded-md">
                  {tool}
                </Badge>
              ))}
            </div>
          </section>

          <section className="rounded-md border bg-background p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <GitBranch className="size-4" />
              Branch
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {agent.branch}
            </p>
          </section>

          <section className="rounded-md border bg-background p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <CircleDot className="size-4" />
              Next Step
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {agent.nextStep}
            </p>
          </section>

          <Button className="w-full gap-2" onClick={() => onFocus(agent)}>
            <Play className="size-4" />
            Focus This Subagent
          </Button>
        </div>
      </div>
    </div>
  )
}
