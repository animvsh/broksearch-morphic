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
  MoreHorizontal,
  Play,
  PlugZap,
  Radar,
  RefreshCcw,
  Rocket,
  Send,
  Share2,
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
import {
  extractGeneratedBrokCodeFiles,
  GeneratedBrokCodeFile
} from '@/lib/brokcode/generated-files'
import { openComposioPopup } from '@/lib/composio-popup'
import { cn } from '@/lib/utils'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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

type BrokCodeRuntime = 'pi' | 'opencode' | 'brok' | 'not_connected'
type GithubConnectionStatus = 'checking' | 'connected' | 'ready' | 'unavailable'
type PreviewHealthStatus = 'idle' | 'checking' | 'online' | 'offline'
type BrokCodeBackendProvider = 'none' | 'insforge'
type BrokCodeBackendHealthStatus =
  | 'unknown'
  | 'checking'
  | 'online'
  | 'offline'
  | 'auth_error'
  | 'not_found'
  | 'expired_or_limited'
  | 'error'

type BrokCodeBackendMetadata = {
  provider: BrokCodeBackendProvider
  mode?: 'trial' | 'existing' | 'self_hosted' | 'shared_railway'
  status: 'not_configured' | 'provisioning' | 'ready' | 'error' | 'expired'
  projectUrl?: string | null
  dashboardUrl?: string | null
  claimUrl?: string | null
  projectId?: string | null
  appkey?: string | null
  region?: string | null
  trialExpiresAt?: string | null
  health: BrokCodeBackendHealthStatus
  lastHealthStatus?: number | null
  lastHealthCheckedAt?: string | null
  adminKeyConfigured: boolean
  error?: string | null
  capabilities?: {
    database: boolean
    auth: boolean
    storage: boolean
    functions: boolean
    realtime: boolean
  }
}

type BrokCodeProject = {
  id: string
  name: string
  slug: string
  username?: string | null
  previewUrl?: string | null
  deploymentUrl?: string | null
  metadata?: {
    backend?: BrokCodeBackendMetadata
    [key: string]: unknown
  } | null
}

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

function getRuntimeLabel(runtime: BrokCodeRuntime) {
  if (runtime === 'pi') return 'Pi coding-agent'
  if (runtime === 'opencode') return 'brokcode-cloud'
  if (runtime === 'brok') return 'Brok API runtime'
  return 'Waiting for runtime'
}

function getRuntimeTool(runtime: BrokCodeRuntime) {
  if (runtime === 'pi') return 'pi-coding-agent'
  if (runtime === 'opencode') return 'brokcode-cloud'
  if (runtime === 'brok') return 'brok-api'
  return 'not-connected'
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

type SavedBrokCodeKey = {
  id: string
  name: string
  prefix: string
  environment: 'test' | 'live'
  scopes: string[]
  defaultSessionId: string
  updatedAt: string
  lastValidatedAt: string
}

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
      role: getRuntimeLabel(run.runtime),
      status,
      accent: accents[index % accents.length],
      progress,
      currentTask: activeStep
        ? `${activeStep.label}: ${activeStep.detail}`
        : run.command,
      branch: 'Runtime reported branch unavailable',
      files: run.previewUrl ? [run.previewUrl] : ['No file changes reported'],
      tools: [getRuntimeTool(run.runtime), 'SSE', 'usage-metering'],
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
    label: 'Understands the request',
    detail: 'Reads the command, project context, and selected backend.',
    status: 'queued'
  },
  {
    id: 'plan',
    label: 'Chooses the next move',
    detail: 'Decides whether this needs code, preview, deploy, or GitHub work.',
    status: 'queued'
  },
  {
    id: 'execute',
    label: 'Works in the coding agent',
    detail: 'Runs the Pi/BrokCode runtime and streams back useful output.',
    status: 'queued'
  },
  {
    id: 'validate',
    label: 'Checks the result',
    detail: 'Looks for preview URLs, errors, usage, and next actions.',
    status: 'queued'
  },
  {
    id: 'summarize',
    label: 'Reports what changed',
    detail: 'Turns runtime output into a short, usable answer.',
    status: 'queued'
  }
]

const runStreamingHints = [
  'Reading the project and request',
  'Choosing the next useful action',
  'Working through the coding runtime',
  'Checking output and preview state',
  'Preparing the answer'
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

  const genericMatch = normalized.match(
    /\b(?:connect|authorize|oauth|link|login|sign in)\s+(?:my\s+|the\s+|to\s+|with\s+)?([a-z0-9][a-z0-9 _-]{1,40})\b/i
  )
  const candidate = genericMatch?.[1]
    ?.replace(/\b(account|app|integration|provider|toolkit|please|pls)\b/g, '')
    .trim()
    .replace(/[\s_]+/g, '')
    .replace(/[^a-z0-9-]/g, '')

  return candidate && candidate.length >= 2 ? candidate : null
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
    'You are Brok Code, a coding agent and no-code app builder for nontechnical users.',
    'Keep responses short, plain, and product-focused. Do not expose runtime plumbing unless it is needed to unblock the user.',
    'When building a website, app, landing page, or UI, return real project files as fenced code blocks with filenames so Brok saves them into the cloud project filesystem.',
    'Use this exact format for generated files: ```html filename=index.html, ```css filename=styles.css, ```js filename=app.js, or framework paths like ```tsx filename=app/page.tsx.',
    'Prefer a clean multi-file cloud project when it improves maintainability. Include an `index.html` entry point for static previews when the app can run without a build step.',
    'Assume Brok will persist the files, hot-reload the managed cloud preview, and keep the user in the browser builder.',
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

  const candidate =
    trimmed.startsWith('/') && typeof window !== 'undefined'
      ? new URL(trimmed, window.location.origin).toString()
      : /^https?:\/\//i.test(trimmed)
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
  const matches = text.matchAll(
    /https?:\/\/(?:127\.0\.0\.1|localhost|[^\s"'<>`)]+)/gi
  )

  for (const match of matches) {
    const normalized = normalizePreviewUrl(match[0].replace(/[),.;:!?`]+$/, ''))
    if (!normalized) continue

    try {
      const parsed = new URL(normalized)
      const hostname = parsed.hostname.toLowerCase()
      const pathname = parsed.pathname.toLowerCase()

      if (hostname === 'api.brok.io' || pathname.startsWith('/v1/')) {
        continue
      }

      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.railway.app') ||
        (typeof window !== 'undefined' &&
          parsed.origin === window.location.origin)
      ) {
        return normalized
      }
    } catch {}
  }

  return null
}

type GeneratedPreviewFile = GeneratedBrokCodeFile

function makeProjectNameFromPrompt(prompt: string) {
  const cleaned = prompt
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return 'BrokCode app'

  const words = cleaned.split(' ').slice(0, 6).join(' ')
  return words.length > 48 ? `${words.slice(0, 45)}...` : words
}

function extractGeneratedPreviewFiles(text: string): GeneratedPreviewFile[] {
  return extractGeneratedBrokCodeFiles(text)
}

function cleanAssistantContentForBuilder(content: string) {
  return content
    .replace(/^Live \([^)]+\)\s*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
  let receivedResult = false

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
      const content = typeof payload.content === 'string' ? payload.content : ''
      if (content) {
        accumulated += content
        onEvent({ type: 'delta', content, accumulated })
      }
      return
    }

    if (eventType === 'result') {
      receivedResult = true
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
          : 'Pi coding-agent execution failed.'
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

  if (!receivedResult) {
    throw new Error(
      accumulated.trim()
        ? 'BrokCode runtime ended before sending a final result event.'
        : 'BrokCode runtime ended without a final result event.'
    )
  }

  return {
    runtime:
      result?.runtime === 'opencode' ||
      result?.runtime === 'pi' ||
      result?.runtime === 'brok' ||
      result?.runtime === 'not_connected'
        ? result.runtime
        : 'brok',
    model: typeof result?.model === 'string' ? result.model : undefined,
    content:
      accumulated.trim() ||
      (typeof result?.content === 'string' ? result.content.trim() : '') ||
      'The build finished, but Brok did not return a written summary.',
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
  const hydratedProjectPreviewRef = useRef<string | null>(null)
  const pendingCloudStartPromptRef = useRef<string | null>(null)
  const runCommandRef = useRef<((command: string) => Promise<void>) | null>(
    null
  )
  const [selectedId, setSelectedId] = useState('')
  const [input, setInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [runHintIndex, setRunHintIndex] = useState(0)
  const [activeRuntime, setActiveRuntime] =
    useState<BrokCodeRuntime>('not_connected')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [savedRuntimeKey, setSavedRuntimeKey] =
    useState<SavedBrokCodeKey | null>(null)
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
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewInput, setPreviewInput] = useState('')
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
  const [projects, setProjects] = useState<BrokCodeProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [backendSaving, setBackendSaving] = useState(false)
  const [backendProvisioning, setBackendProvisioning] = useState(false)
  const [backendChecking, setBackendChecking] = useState(false)
  const [backendProjectName, setBackendProjectName] = useState('BrokCode app')
  const [insForgeProjectUrl, setInsForgeProjectUrl] = useState('')
  const [insForgeDashboardUrl, setInsForgeDashboardUrl] = useState('')
  const [insForgeAdminKey, setInsForgeAdminKey] = useState('')
  const [isSharing, startShareTransition] = useTransition()
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'I am Brok Code. You are signed in, so browser runs are ready. Connect GitHub for repo work, then build and preview directly in the cloud.'
    }
  ])

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

      const savedSessionId = getStoredSessionId()
      setSyncSessionId(savedSessionId)

      const legacySavedKey = localStorage.getItem(BROK_KEY_STORAGE)
      if (legacySavedKey && isValidBrokApiKey(legacySavedKey)) {
        try {
          const saveResponse = await fetch('/api/brokcode/key', {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${legacySavedKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ defaultSessionId: savedSessionId })
          })
          if (saveResponse.ok) {
            localStorage.removeItem(BROK_KEY_STORAGE)
          }
        } catch {}
      }

      if (cancelled) return

      try {
        const response = await fetch('/api/brokcode/key', {
          headers: legacySavedKey
            ? { Authorization: `Bearer ${legacySavedKey}` }
            : {}
        })
        const body = await response.json().catch(() => null)
        if (response.ok && body?.key) {
          const savedKey = body.key as SavedBrokCodeKey
          setSavedRuntimeKey(savedKey)
          setApiKeyInput('')
          if (savedKey.defaultSessionId) {
            setSyncSessionId(savedKey.defaultSessionId)
            localStorage.setItem(
              BROK_SESSION_STORAGE,
              savedKey.defaultSessionId
            )
          }
        } else if (legacySavedKey && isValidBrokApiKey(legacySavedKey)) {
          const accountResponse = await fetch('/api/brokcode/account', {
            headers: { Authorization: `Bearer ${legacySavedKey}` }
          })
          if (!accountResponse.ok) {
            setApiKeyError(
              body?.error?.message ?? 'Saved key could not be restored.'
            )
          } else {
            setApiKey(legacySavedKey)
          }
        }
      } catch {}

      localStorage.removeItem(BROK_KEY_STORAGE)
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
  const activeProject = useMemo(
    () =>
      projects.find(project => project.id === activeProjectId) ??
      projects[0] ??
      null,
    [activeProjectId, projects]
  )
  const activeBackend =
    activeProject?.metadata?.backend ??
    ({
      provider: 'none',
      status: 'not_configured',
      health: 'unknown',
      adminKeyConfigured: false
    } satisfies BrokCodeBackendMetadata)
  const activeSyncSession = useMemo(
    () =>
      syncedSessions.find(session => session.id === syncSessionId) ??
      syncedSessions[0] ??
      null,
    [syncSessionId, syncedSessions]
  )

  const hasLiveKey = Boolean(
    (apiKey && isValidBrokApiKey(apiKey)) || savedRuntimeKey
  )
  const hasAccountRuntime = Boolean(accountEmail)
  const hasLiveRuntime = hasAccountRuntime || hasLiveKey
  const maskedKey =
    apiKey && isValidBrokApiKey(apiKey)
      ? maskBrokApiKey(apiKey)
      : savedRuntimeKey
        ? `${savedRuntimeKey.prefix}...`
        : null
  const codeModels =
    models.length > 0
      ? models
      : [{ id: 'brok-code', name: 'Brok Code', supports_code: true }]

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
      if (key && !isValidBrokApiKey(key)) {
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
      if (key && !isValidBrokApiKey(key)) {
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

  const refreshProjects = useCallback(
    async (key = apiKey) => {
      if (key && !isValidBrokApiKey(key)) {
        setProjects([])
        return
      }

      try {
        const response = await fetch('/api/brokcode/projects', {
          headers: getAuthHeaders(key)
        })
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(body?.error?.message ?? 'Project lookup failed.')
        }

        const nextProjects = Array.isArray(body?.projects)
          ? (body.projects as BrokCodeProject[])
          : []
        setProjects(nextProjects)
        setActiveProjectId(current =>
          current && nextProjects.some(project => project.id === current)
            ? current
            : (nextProjects[0]?.id ?? '')
        )
      } catch (error) {
        setRuntimeError(
          error instanceof Error ? error.message : 'Could not load projects.'
        )
      }
    },
    [apiKey, getAuthHeaders]
  )

  const refreshRepoContext = useCallback(
    async (key = apiKey) => {
      if (key && !isValidBrokApiKey(key)) {
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

  async function ensureProjectForRun(command: string) {
    if (activeProject) return activeProject

    const response = await fetch('/api/brokcode/projects', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(apiKey),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: makeProjectNameFromPrompt(command)
      })
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(body?.error?.message ?? 'Could not create project.')
    }

    const project = body?.project as BrokCodeProject | undefined
    if (!project?.id) {
      throw new Error('Project creation did not return a project.')
    }

    setProjects(current => [project, ...current])
    setActiveProjectId(project.id)
    return project
  }

  async function saveGeneratedPreviewFiles({
    files,
    projectId
  }: {
    files: GeneratedPreviewFile[]
    projectId: string
  }) {
    await Promise.all(
      files.map(file =>
        fetch(`/api/brokcode/projects/${projectId}/files`, {
          method: 'PUT',
          headers: {
            ...getAuthHeaders(apiKey),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(file)
        }).then(async response => {
          if (response.ok) return
          const body = await response.json().catch(() => null)
          throw new Error(body?.error ?? `Could not save ${file.path}`)
        })
      )
    )
  }

  async function openCloudProjectPreview(projectId: string) {
    const response = await fetch(
      `/api/brokcode/projects/${projectId}/preview`,
      {
        method: 'POST',
        headers: getAuthHeaders(apiKey)
      }
    )
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(body?.error?.message ?? 'Could not start preview.')
    }

    const previewCandidate =
      body?.previewUrl ??
      body?.deploymentPreviewUrl ??
      body?.project?.previewUrl
    const loadedPreviewUrl = loadPreviewUrlIfAllowed(previewCandidate)
    if (body?.project?.id) {
      const project = body.project as BrokCodeProject
      setProjects(current => [
        project,
        ...current.filter(item => item.id !== project.id)
      ])
      setActiveProjectId(project.id)
    }
    return loadedPreviewUrl
  }

  useEffect(() => {
    void refreshGithubStatus()
  }, [refreshGithubStatus])

  useEffect(() => {
    if (!hasLiveRuntime) {
      setUsage(null)
      setSyncedSessions([])
      setVersions([])
      setRepoContext(null)
      setProjects([])
      return
    }

    if (apiKey) {
      void refreshUsage(apiKey)
    } else {
      setUsage(null)
    }
    void refreshSyncedSessions(apiKey)
    void refreshVersions(apiKey)
    void refreshRepoContext(apiKey)
    void refreshProjects(apiKey)
  }, [
    apiKey,
    hasLiveKey,
    hasLiveRuntime,
    refreshProjects,
    refreshRepoContext,
    refreshSyncedSessions,
    refreshVersions
  ])

  useEffect(() => {
    if (!hasLiveRuntime || (apiKey && !isValidBrokApiKey(apiKey))) return
    void refreshVersions(apiKey)
  }, [apiKey, hasLiveRuntime, refreshVersions, syncSessionId])

  useEffect(() => {
    if (!hasLiveRuntime || (apiKey && !isValidBrokApiKey(apiKey))) return

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refreshSyncedSessions(apiKey)
    }, 15000)

    return () => window.clearInterval(timer)
  }, [apiKey, hasLiveRuntime, refreshSyncedSessions])

  useEffect(() => {
    if (!activeProject) return
    setBackendProjectName(activeProject.name)
    if (activeBackend.provider === 'insforge') {
      setInsForgeProjectUrl(activeBackend.projectUrl ?? '')
      setInsForgeDashboardUrl(activeBackend.dashboardUrl ?? '')
    } else {
      setInsForgeProjectUrl('')
      setInsForgeDashboardUrl('')
    }
    setInsForgeAdminKey('')
  }, [activeBackend, activeProject])

  async function saveInsForgeBackend() {
    if (!hasLiveRuntime) {
      setRuntimeError('Sign in before configuring a BrokCode backend.')
      return
    }

    const projectUrl = insForgeProjectUrl.trim()
    if (!projectUrl) {
      setRuntimeError('Add an InsForge project URL before saving backend.')
      return
    }

    setBackendSaving(true)
    setRuntimeError(null)
    try {
      const backend = {
        provider: 'insforge',
        mode: 'existing',
        projectUrl,
        dashboardUrl: insForgeDashboardUrl.trim() || undefined,
        adminKey: insForgeAdminKey.trim() || undefined
      }
      const response = activeProject
        ? await fetch(`/api/brokcode/projects/${activeProject.id}/backend`, {
            method: 'PUT',
            headers: {
              ...getAuthHeaders(),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ backend })
          })
        : await fetch('/api/brokcode/projects', {
            method: 'POST',
            headers: {
              ...getAuthHeaders(),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: backendProjectName.trim() || 'BrokCode app',
              backend
            })
          })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'Backend save failed.')
      }

      await refreshProjects(apiKey)
      const project = body?.project as BrokCodeProject | undefined
      if (project?.id) setActiveProjectId(project.id)
      setInsForgeAdminKey('')
      toast.success('InsForge backend saved')
    } catch (error) {
      setRuntimeError(
        error instanceof Error
          ? error.message
          : 'Could not save InsForge backend.'
      )
    } finally {
      setBackendSaving(false)
    }
  }

  async function provisionInsForgeBackend() {
    if (!hasLiveRuntime) {
      setRuntimeError('Sign in before provisioning an InsForge backend.')
      return
    }

    setBackendProvisioning(true)
    setRuntimeError(null)
    try {
      const response = await fetch(
        '/api/brokcode/projects/insforge/provision',
        {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project_id: activeProject?.id ?? undefined,
            projectName:
              activeProject?.name || backendProjectName.trim() || 'BrokCode app'
          })
        }
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.error ?? 'InsForge provisioning failed.')
      }

      await refreshProjects(apiKey)
      const project = body?.project as BrokCodeProject | undefined
      if (project?.id) setActiveProjectId(project.id)
      toast.success(
        body?.backend?.health === 'online'
          ? 'InsForge backend is ready'
          : 'InsForge backend was created and is still warming up'
      )
    } catch (error) {
      setRuntimeError(
        error instanceof Error
          ? error.message
          : 'Could not provision InsForge backend.'
      )
    } finally {
      setBackendProvisioning(false)
    }
  }

  async function clearBackend() {
    if (!activeProject) return
    setBackendSaving(true)
    setRuntimeError(null)
    try {
      const response = await fetch(
        `/api/brokcode/projects/${activeProject.id}/backend`,
        {
          method: 'PUT',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ provider: 'none' })
        }
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'Backend reset failed.')
      }

      await refreshProjects(apiKey)
      toast.success('Backend cleared')
    } catch (error) {
      setRuntimeError(
        error instanceof Error ? error.message : 'Could not clear backend.'
      )
    } finally {
      setBackendSaving(false)
    }
  }

  async function checkBackendHealth() {
    if (!activeProject) {
      setRuntimeError('Create or select a BrokCode project first.')
      return
    }

    setBackendChecking(true)
    setRuntimeError(null)
    try {
      const response = await fetch(
        `/api/brokcode/projects/${activeProject.id}/backend/health`,
        {
          method: 'POST',
          headers: getAuthHeaders()
        }
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'Backend health check failed.')
      }

      await refreshProjects(apiKey)
      toast.success(
        body?.backend?.health === 'online'
          ? 'InsForge backend is online'
          : 'InsForge backend check finished'
      )
    } catch (error) {
      setRuntimeError(
        error instanceof Error ? error.message : 'Could not check backend.'
      )
    } finally {
      setBackendChecking(false)
    }
  }

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
    if (!hasLiveRuntime) return

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
      runtime: hasLiveRuntime ? 'pi' : 'not_connected',
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
      setRuntimeError('Enter a valid preview URL or BrokCode preview path.')
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

  function loadPreviewUrlIfAllowed(rawTarget: unknown) {
    if (typeof rawTarget !== 'string') return null
    const normalized = normalizePreviewUrl(rawTarget)
    if (!normalized || isBrokCodeWorkspaceUrl(normalized)) return null

    loadPreviewTarget(normalized)
    return normalized
  }

  useEffect(() => {
    if (!activeProject) return

    const candidate = activeProject.previewUrl ?? activeProject.deploymentUrl
    const normalized =
      typeof candidate === 'string' ? normalizePreviewUrl(candidate) : null
    if (!normalized || isBrokCodeWorkspaceUrl(normalized)) return

    const hydrationKey = `${activeProject.id}:${normalized}`
    if (hydratedProjectPreviewRef.current === hydrationKey) return

    const currentPreviewIsManaged =
      previewUrl.includes('/api/brokcode/previews/') ||
      previewUrl.trim().length === 0
    const nextPreviewIsProjectManaged = normalized.includes(
      `/api/brokcode/previews/${encodeURIComponent(activeProject.id)}/`
    )

    if (!currentPreviewIsManaged && !nextPreviewIsProjectManaged) return

    hydratedProjectPreviewRef.current = hydrationKey
    setPreviewUrl(normalized)
    setPreviewInput(normalized)
    setPreviewFrameKey(value => value + 1)
  }, [
    activeProject,
    activeProject?.deploymentUrl,
    activeProject?.id,
    activeProject?.previewUrl,
    previewUrl
  ])

  function applyPreviewInput() {
    loadPreviewTarget(previewInput)
  }

  const checkPreviewHealth = useCallback(
    async (target = previewUrl) => {
      const normalized = normalizePreviewUrl(target)
      if (!target.trim()) {
        setPreviewHealth({
          status: 'idle',
          message:
            'Preview appears here after a run or when you paste an app URL.'
        })
        return
      }

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
    },
    [previewUrl]
  )

  function reloadPreview() {
    if (!previewUrl.trim()) {
      setPreviewHealth({
        status: 'idle',
        message:
          'Preview appears here after a run or when you paste an app URL.'
      })
      return
    }

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

    try {
      const saveResponse = await fetch('/api/brokcode/key', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${trimmed}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ defaultSessionId: syncSessionId })
      })
      const savedBody = await saveResponse.json().catch(() => null)
      if (!saveResponse.ok) {
        setApiKeyError(
          savedBody?.error?.message ??
            'Validated key, but could not store it in BrokCode key vault.'
        )
        return
      }
      setSavedRuntimeKey((savedBody?.key as SavedBrokCodeKey) ?? null)
    } catch {
      setApiKeyError(
        'Validated key, but could not store it in BrokCode key vault.'
      )
      return
    }

    localStorage.removeItem(BROK_KEY_STORAGE)
    setApiKey(trimmed)
    setApiKeyInput('')
    setApiKeyError(null)
    setRuntimeError(null)
  }

  async function clearApiKey() {
    const keyToUse = apiKey
    localStorage.removeItem(BROK_KEY_STORAGE)
    try {
      await fetch('/api/brokcode/key', {
        method: 'DELETE',
        headers: keyToUse ? { Authorization: `Bearer ${keyToUse}` } : {}
      })
    } catch {}
    setApiKey(null)
    setSavedRuntimeKey(null)
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
      void fetch('/api/brokcode/key', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ defaultSessionId: normalized })
      })
    }
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
    if (!hasLiveRuntime) return null

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
      checkMessages.push(
        '- Usage endpoint skipped for browser session (no CLI/TUI key set).'
      )
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
    if (!hasLiveRuntime) {
      setRuntimeError('Sign in before deploying from BrokCode Cloud.')
      return
    }

    setIsDeploying(true)
    setRuntimeError(null)

    try {
      const response = await fetch('/api/brokcode/deploy', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(apiKey),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source: 'browser',
          project_id: activeProject?.id ?? null
        })
      })

      const body = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'Deployment failed to start.')
      }

      const deploymentId =
        typeof body?.deploymentId === 'string' ? body.deploymentId : null
      const strategy =
        typeof body?.strategy === 'string' ? body.strategy : 'unknown'
      const previewCandidate =
        body?.previewUrl ??
        body?.deploymentPreviewUrl ??
        body?.deployment?.previewUrl ??
        body?.deployment?.deploymentPreviewUrl ??
        body?.deployment?.deploymentUrl ??
        body?.deployment?.url
      const loadedPreviewUrl = loadPreviewUrlIfAllowed(previewCandidate)
      const message = loadedPreviewUrl
        ? 'Preview is live.'
        : typeof body?.message === 'string'
          ? body.message
          : 'Deployment started.'

      setMessages(current => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          content: loadedPreviewUrl
            ? `${message} I opened it on the right.`
            : `${message}${deploymentId ? `\nDeployment ID: ${deploymentId}` : ''}`
        }
      ])
      void persistVersionSnapshot({
        command: '1-click deploy',
        summary: `${message} Strategy: ${strategy}`,
        runtime: activeRuntime === 'not_connected' ? 'brok' : activeRuntime,
        status: 'done',
        previewUrl: loadedPreviewUrl,
        prUrl: null
      })
      if (activeProject?.id) {
        void refreshProjects(apiKey)
      }
      toast.success(
        loadedPreviewUrl
          ? 'Deployment triggered and preview loaded'
          : 'Deployment triggered'
      )
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
        const popup = openComposioPopup(
          body.connectionUrl,
          'brokcode-github-connect'
        )

        if (!popup) {
          const message =
            'Popup blocked. Allow popups for Brok, then connect GitHub again.'
          setGithubStatus('ready')
          setGithubMessage(message)
          toast.error(message)
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
        const popup = openComposioPopup(
          body.connectionUrl,
          `brokcode-integration-${normalizedToolkit}`
        )

        if (!popup) {
          const message = `Popup blocked. Allow popups for Brok, then connect ${formatToolkitName(
            normalizedToolkit
          )} again.`
          setRuntimeError(message)
          toast.error(message)
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
    if (!hasLiveRuntime) {
      setRuntimeError('Sign in before opening a PR.')
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

    if (!hasLiveRuntime) {
      setRuntimeError('Sign in before starting a real BrokCode run.')
      setMessages(current => [
        ...current,
        {
          id: createId('system'),
          role: 'system',
          content:
            'Real BrokCode execution requires a signed-in Brok account. The browser builder uses your account session automatically.'
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
        id: assistantMessageId,
        role: 'assistant',
        content: 'I am setting up the project and preview...'
      }
    ])
    setRuntimeError(null)
    void appendSyncEvent({
      role: 'user',
      type: 'command',
      content: trimmed,
      metadata: {
        runtime: 'cloud',
        model: selectedModel,
        projectId: activeProject?.id ?? null,
        backendProvider: activeBackend.provider,
        backendStatus: activeBackend.status,
        backendUrl:
          activeBackend.provider === 'insforge'
            ? activeBackend.projectUrl
            : null
      }
    })

    const actions: ChatAction[] =
      trimmed.toLowerCase().includes('pr') ||
      trimmed.toLowerCase().includes('github')
        ? ['run-checks', 'open-pr', 'connect-github']
        : ['run-checks']

    updateExecutionStep(run.id, 'parse', 'done', 'Request understood.')
    updateExecutionStep(
      run.id,
      'plan',
      'running',
      'Preparing real runtime request.'
    )

    try {
      const runProject = await ensureProjectForRun(trimmed)

      updateExecutionStep(run.id, 'plan', 'done', 'Project is ready.')
      updateExecutionStep(
        run.id,
        'execute',
        'running',
        'Building the requested changes.'
      )

      const response = await fetch('/api/brokcode/execute', {
        method: 'POST',
        headers: {
          ...(apiKey && isValidBrokApiKey(apiKey)
            ? { Authorization: `Bearer ${apiKey}` }
            : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command: trimmed,
          model: selectedModel,
          source: 'browser',
          session_id: syncSessionId,
          stream: true,
          prefer_pi: true,
          allow_brok_fallback: true,
          project_id: runProject.id,
          backend_provider: activeBackend.provider,
          backend_status: activeBackend.status,
          backend_project_url:
            activeBackend.provider === 'insforge'
              ? activeBackend.projectUrl
              : null,
          messages: [
            {
              role: 'system',
              content: `${buildCommandPrompt(trimmed)}\n\nProject context: ${runProject.name} (${runProject.id}).\nBackend context: ${activeBackend.provider === 'insforge' ? `InsForge ${activeBackend.status}; project URL ${activeBackend.projectUrl ?? 'not set'}; database/auth/storage/functions are available when configured. Never ask the browser for the InsForge admin key.` : 'No backend provider configured yet.'}`
            },
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
                  message.content.startsWith('I am setting up')
                    ? {
                        ...message,
                        content: `${event.message}\n\nI will open the preview when it is ready.`
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
                      content: cleanAssistantContentForBuilder(
                        event.accumulated
                      )
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
          ? cleanAssistantContentForBuilder(content)
          : 'The build finished, but Brok did not return a written summary.'
      const externalPreviewUrl =
        typeof body?.preview_url === 'string'
          ? body.preview_url
          : extractPreviewUrlFromText(assistantContent)
      const generatedFiles = extractGeneratedPreviewFiles(assistantContent)

      let managedPreviewUrl: string | null = null
      if (generatedFiles.length > 0) {
        updateExecutionStep(
          run.id,
          'validate',
          'running',
          `Saving ${generatedFiles.length} generated file${
            generatedFiles.length === 1 ? '' : 's'
          }.`
        )
        await saveGeneratedPreviewFiles({
          projectId: runProject.id,
          files: generatedFiles
        })
        managedPreviewUrl = await openCloudProjectPreview(runProject.id)
      } else if (!externalPreviewUrl) {
        managedPreviewUrl = await openCloudProjectPreview(runProject.id)
      }

      const discoveredPreviewUrl = managedPreviewUrl ?? externalPreviewUrl

      setActiveRuntime(runtime)
      updateExecutionStep(run.id, 'execute', 'done', 'Build finished.')
      updateExecutionStep(
        run.id,
        'validate',
        'done',
        discoveredPreviewUrl
          ? 'Cloud preview is open.'
          : 'Run completed without a preview URL.'
      )
      updateExecutionStep(run.id, 'summarize', 'done', 'Summary is ready.')
      finalizeExecutionRun(run.id, {
        runtime,
        status: 'done',
        note:
          typeof body?.note === 'string'
            ? body.note
            : `${getRuntimeLabel(runtime)} active.`,
        previewUrl: discoveredPreviewUrl
      })

      if (discoveredPreviewUrl) {
        loadPreviewUrlIfAllowed(discoveredPreviewUrl)
      }

      setMessages(current =>
        current.map(message =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: discoveredPreviewUrl
                  ? `Done. I opened the preview on the right.\n\n${assistantContent}`
                  : `Done.\n\n${assistantContent}`,
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
          model: selectedModel,
          projectId: runProject.id,
          backendProvider: activeBackend.provider,
          backendStatus: activeBackend.status,
          backendUrl:
            activeBackend.provider === 'insforge'
              ? activeBackend.projectUrl
              : null
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
          model: selectedModel,
          projectId: activeProject?.id ?? null,
          backendProvider: activeBackend.provider,
          backendStatus: activeBackend.status,
          backendUrl:
            activeBackend.provider === 'insforge'
              ? activeBackend.projectUrl
              : null
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

      if (!hasLiveRuntime) {
        pendingCloudStartPromptRef.current = prompt
        setMessages(current => [
          ...current,
          {
            id: createId('system'),
            role: 'system',
            content:
              'BrokCode Cloud is queued. Sign in to start this browser run.',
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
    hasLiveRuntime,
    initialPrompt,
    runtimeBootstrapped
  ])

  useEffect(() => {
    if (!hasLiveRuntime || isRunning) return
    if (connectGithub && githubStatus !== 'connected') return

    const prompt = pendingCloudStartPromptRef.current
    if (!prompt) return

    pendingCloudStartPromptRef.current = null
    void runCommandRef.current?.(buildCloudStartCommand(prompt, connectGithub))
  }, [connectGithub, githubStatus, hasLiveRuntime, isRunning])

  return (
    <div className="brokcode-lovable flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f6f6f3] text-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/90 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="flex h-11 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900 shadow-sm">
              <Code2 className="size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-zinc-950 sm:text-base">
                Brok Code
              </h1>
              <p className="truncate text-xs text-zinc-500">
                {isRunning
                  ? runStreamingHints[runHintIndex]
                  : getRuntimeLabel(activeRuntime)}
              </p>
            </div>
          </div>

          <div className="hidden min-w-0 items-center gap-2 text-xs text-zinc-500 md:flex">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  hasLiveRuntime ? 'bg-emerald-500' : 'bg-zinc-300'
                )}
              />
              {hasLiveKey
                ? 'Key ready'
                : hasAccountRuntime
                  ? 'Browser ready'
                  : 'Sign in required'}
              <span className="text-zinc-300">/</span>
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  githubStatus === 'connected'
                    ? 'bg-emerald-400'
                    : githubStatus === 'checking'
                      ? 'animate-pulse bg-cyan-500'
                      : 'bg-zinc-300'
                )}
              />
              GitHub{' '}
              {githubStatus === 'connected'
                ? 'connected'
                : githubStatus === 'checking'
                  ? 'checking'
                  : 'off'}
              <span className="text-zinc-300">/</span>
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  activeBackend.provider === 'insforge' &&
                    activeBackend.health === 'online'
                    ? 'bg-emerald-400'
                    : activeBackend.provider === 'insforge'
                      ? 'bg-cyan-500'
                      : 'bg-zinc-300'
                )}
              />
              {activeBackend.provider === 'insforge'
                ? `InsForge ${activeBackend.health === 'online' ? 'online' : activeBackend.status}`
                : 'Backend off'}
            </span>
            {isConnectingIntegration && (
              <span className="truncate rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1">
                Connecting {formatToolkitName(isConnectingIntegration)}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-9 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
              title="Open TUI"
            >
              <Link href="/brokcode/tui">
                <TerminalSquare className="size-4" />
                <span className="sr-only">Open TUI</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
              disabled={isSharing}
              title="Share chat"
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
              <span className="sr-only">
                {isSharing ? 'Sharing chat' : 'Share chat'}
              </span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
                  title="Brok Code actions"
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Brok Code actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Workspace</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={
                    isConnectingGithub ||
                    Boolean(isConnectingIntegration) ||
                    githubStatus === 'connected'
                  }
                  onClick={() => handleChatAction('connect-github')}
                >
                  <Github className="size-4" />
                  {githubStatus === 'connected'
                    ? 'GitHub connected'
                    : isConnectingGithub
                      ? 'Connecting GitHub...'
                      : 'Connect GitHub'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleChatAction('run-checks')}
                >
                  <CheckCircle2 className="size-4" />
                  Run platform checks
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Ship</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={
                    !hasLiveRuntime ||
                    isSubmittingPr ||
                    githubStatus !== 'connected'
                  }
                  onClick={() => {
                    void submitPullRequest()
                  }}
                >
                  <Rocket className="size-4" />
                  {isSubmittingPr ? 'Opening PR...' : 'Open PR'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasLiveRuntime || isDeploying}
                  onClick={() => {
                    void deployBrokCodeCloud()
                  }}
                >
                  <Rocket className="size-4" />
                  {isDeploying ? 'Deploying...' : '1-click deploy'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/brokcode/tui">
                    <TerminalSquare className="size-4" />
                    Open terminal TUI
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <KeyRound className="size-4" />
                  {hasLiveKey
                    ? `API key ${maskedKey ?? 'ready'}`
                    : 'CLI/TUI key optional'}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Globe className="size-4" />
                  Sync session {syncSessionId}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto bg-[#f6f6f3] lg:grid-cols-[minmax(350px,430px)_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[minmax(380px,450px)_minmax(0,1fr)]">
        <section className="flex min-h-[52dvh] flex-col overflow-hidden border-b border-zinc-200/80 bg-white lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="border-b border-zinc-200/80 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-950">
                  Builder chat
                </p>
                <p className="hidden truncate text-xs text-zinc-500 sm:block">
                  Describe the app. Brok builds, checks, and keeps preview live.
                </p>
              </div>
              <Badge
                variant={isRunning ? 'default' : 'secondary'}
                className="shrink-0 rounded-full border-zinc-200 bg-zinc-50 text-zinc-700"
              >
                {isRunning ? 'Working' : 'Ready'}
              </Badge>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-5">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="hidden">
                <SyncedSessionPanel
                  session={activeSyncSession}
                  sessionId={syncSessionId}
                  loading={syncLoading}
                  onRefresh={() => {
                    void refreshSyncedSessions()
                  }}
                />
              </div>

              <div className="hidden">
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

              <div className="hidden">
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
                <div className="mr-auto max-w-[min(100%,42rem)] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-zinc-950 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wand2 className="size-4" />
                    <span>Brok Code is working</span>
                    <span className="typing-dots" aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    <span className="thinking-text">
                      {runStreamingHints[runHintIndex]}
                    </span>
                  </p>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-200">
                    <div className="h-full w-2/5 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-zinc-900" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-zinc-200/80 bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:p-4">
            <div className="w-full">
              <form
                className="relative flex items-end gap-2 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 p-2 shadow-sm"
                onSubmit={event => {
                  event.preventDefault()
                  runCommand(input)
                }}
              >
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
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
                  className="max-h-32 min-h-11 resize-none border-0 bg-transparent text-sm text-zinc-950 placeholder:text-zinc-400 focus-visible:ring-0 focus-visible:ring-offset-0 sm:max-h-36 sm:min-h-12"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mb-1 size-9 shrink-0 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-950"
                      disabled={isRunning}
                      title="Example commands"
                    >
                      <Wand2 className="size-4" />
                      <span className="sr-only">Example commands</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel>Example commands</DropdownMenuLabel>
                    {brokCodeCommands.map(command => (
                      <DropdownMenuItem
                        key={command}
                        onClick={() => runCommand(command)}
                      >
                        <Wand2 className="size-4" />
                        <span className="line-clamp-1">{command}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="submit"
                  size="icon"
                  className="mb-1 size-9 shrink-0 bg-zinc-950 text-white hover:bg-zinc-800"
                  disabled={isRunning || !input.trim()}
                >
                  <Send className="size-4" />
                  <span className="sr-only">Send</span>
                </Button>
              </form>
            </div>
          </div>
        </section>

        <aside className="flex min-h-[48dvh] flex-col overflow-hidden bg-[#f3f2ee] lg:min-h-0">
          <div className="border-b border-zinc-200/80 bg-white/90 px-3 py-2 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-950">Preview</p>
                <p className="truncate text-xs text-zinc-500">
                  Live cloud canvas. Generated files hot-reload here.
                </p>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 rounded-full border-zinc-200 bg-zinc-50 text-zinc-700"
              >
                {previewHealth.status === 'online'
                  ? 'Live'
                  : previewHealth.status === 'checking'
                    ? 'Checking'
                    : previewHealth.status === 'offline' && previewUrl.trim()
                      ? 'Loaded'
                      : previewHealth.status === 'offline'
                        ? 'Offline'
                        : 'Ready'}
              </Badge>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-2">
            <div className="mb-2 rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-600 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-950">
                    {activeProject?.name ?? 'No project yet'}
                  </p>
                  <p className="truncate text-zinc-500">
                    {activeBackend.provider === 'insforge'
                      ? activeBackend.projectUrl ||
                        'InsForge project URL not set'
                      : 'Cloud project, preview, and backend stay attached here.'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {projects.length > 0 && (
                    <Select
                      value={activeProject?.id ?? ''}
                      onValueChange={value => {
                        setActiveProjectId(value)
                        hydratedProjectPreviewRef.current = null
                      }}
                    >
                      <SelectTrigger className="h-8 w-[150px] rounded-full border-zinc-200 bg-zinc-50 text-xs">
                        <SelectValue placeholder="Project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map(project => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded-full border-zinc-200 bg-zinc-50 text-zinc-700"
                  >
                    {activeBackend.provider === 'insforge'
                      ? activeBackend.health === 'online'
                        ? 'Backend live'
                        : activeBackend.status
                      : 'No backend'}
                  </Badge>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {activeBackend.provider === 'insforge' ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs"
                      disabled={backendChecking}
                      onClick={() => {
                        void checkBackendHealth()
                      }}
                    >
                      {backendChecking ? (
                        <RefreshCcw className="size-3.5 animate-spin" />
                      ) : (
                        <Radar className="size-3.5" />
                      )}
                      Check backend
                    </Button>
                    {activeBackend.dashboardUrl && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full px-3 text-xs"
                      >
                        <a
                          href={activeBackend.dashboardUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="size-3.5" />
                          Dashboard
                        </a>
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    disabled={backendProvisioning || !hasLiveRuntime}
                    onClick={() => {
                      void provisionInsForgeBackend()
                    }}
                  >
                    {backendProvisioning ? (
                      <RefreshCcw className="size-3.5 animate-spin" />
                    ) : (
                      <PlugZap className="size-3.5" />
                    )}
                    Add cloud backend
                  </Button>
                )}
                {activeProject?.previewUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs text-zinc-600"
                    onClick={() =>
                      loadPreviewUrlIfAllowed(activeProject.previewUrl)
                    }
                  >
                    <Eye className="size-3.5" />
                    Open saved preview
                  </Button>
                )}
              </div>
            </div>
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
          </div>

          {(isRunning || executionRuns.length > 0) && (
            <div className="max-h-[180px] overflow-y-auto border-t border-zinc-200/80 bg-white/95 p-2 backdrop-blur sm:max-h-[220px]">
              <ExecutionVisualizer runs={executionRuns} />
            </div>
          )}
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
              <div
                key={event.id}
                className="rounded-md border bg-muted/20 p-2 transition-colors hover:bg-muted/30"
              >
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
          No synced events yet. Run a cloud command in the browser, or start the
          terminal with the same session id when using a CLI/TUI key.
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
        <div className="hidden size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-zinc-300 sm:flex">
          <Bot className="size-4" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[min(100%,42rem)] rounded-2xl border p-3 text-sm leading-6 shadow-[0_18px_46px_-34px_rgba(0,0,0,0.95)] sm:p-4',
          isUser && 'border-white/90 bg-white text-zinc-950',
          isSystem &&
            'border-dashed border-white/10 bg-white/[0.04] py-2 text-xs text-zinc-400',
          !isUser &&
            !isSystem &&
            'border-white/10 bg-white/[0.06] text-zinc-100'
        )}
      >
        {!isUser && !isSystem && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-zinc-400">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
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
                  'rounded-md border border-white/10 bg-white/[0.05] p-2 text-left transition-colors hover:bg-white/10',
                  selectedId === agent.id && 'border-white/50'
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
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
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
                className="w-full gap-2 border-white/[0.15] bg-white/[0.05] text-zinc-100 hover:bg-white/10 sm:w-auto"
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
                className="w-full gap-2 border-white/[0.15] bg-white/[0.05] text-zinc-100 hover:bg-white/10 sm:w-auto"
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
                className="w-full gap-2 border-white/[0.15] bg-white/[0.05] text-zinc-100 hover:bg-white/10 sm:w-auto"
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
                  className="w-full gap-2 border-white/[0.15] bg-white/[0.05] text-zinc-100 hover:bg-white/10 sm:w-auto"
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
        <div className="hidden size-8 shrink-0 items-center justify-center rounded-lg border border-white/80 bg-white text-zinc-950 sm:flex">
          <User className="size-4" />
        </div>
      )}
    </article>
  )
}

function ExecutionVisualizer({ runs }: { runs: ExecutionRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
        No agent activity yet. Send a command to see the reasoning trace.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {runs.slice(0, 2).map(run => (
        <div
          key={run.id}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-950"
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{run.command}</p>
              <p className="text-xs text-zinc-500">
                {new Date(run.startedAt).toLocaleTimeString()} -{' '}
                {run.status === 'running'
                  ? 'Thinking'
                  : run.status === 'done'
                    ? 'Done'
                    : 'Needs attention'}
              </p>
            </div>
            <Badge
              variant={
                run.runtime === 'opencode' || run.runtime === 'pi'
                  ? 'default'
                  : 'outline'
              }
              className="rounded-md"
            >
              {run.runtime === 'not_connected'
                ? 'Not connected'
                : getRuntimeLabel(run.runtime)}
            </Badge>
          </div>

          <div className="mb-2 h-1 overflow-hidden rounded-full bg-zinc-100">
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
            {run.steps
              .filter(step => step.status !== 'queued')
              .map(step => (
                <div key={`${run.id}-${step.id}`} className="grid gap-1">
                  <div className="flex items-start gap-2 text-xs">
                    <span
                      className={cn(
                        'mt-1 size-2 shrink-0 rounded-full',
                        step.status === 'done'
                          ? 'bg-emerald-500'
                          : step.status === 'running'
                            ? 'bg-cyan-500 animate-pulse'
                            : step.status === 'error'
                              ? 'bg-rose-500'
                              : 'bg-muted-foreground/40'
                      )}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-950">{step.label}</p>
                      <p className="text-zinc-500">{step.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            {run.steps.every(step => step.status === 'queued') && (
              <p className="text-xs text-zinc-500">Waiting for the agent.</p>
            )}
          </div>
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
  const hasPreviewUrl = Boolean(previewUrl.trim())
  const isBlockedPreview = isBrokCodeWorkspaceUrl(previewUrl)
  const previewStatus =
    previewHealth.status === 'offline' && hasPreviewUrl
      ? 'loaded'
      : previewHealth.status
  const healthTone =
    previewStatus === 'online'
      ? 'default'
      : previewStatus === 'checking' || previewStatus === 'loaded'
        ? 'secondary'
        : 'outline'
  const previewMessage =
    previewStatus === 'loaded'
      ? 'Preview loaded. Health check may be blocked by the preview origin.'
      : previewHealth.message

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-white shadow-[0_30px_80px_-50px_rgba(0,0,0,0.95)] sm:rounded-2xl">
      <div className="flex flex-col gap-2 border-b border-zinc-200/80 bg-[#f5f4f1] p-2 sm:flex-row sm:items-center">
        <div className="hidden items-center gap-1.5 px-1 sm:flex">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="min-w-0 px-1 sm:w-36">
          <p className="truncate text-xs font-semibold text-zinc-950">
            Cloud Preview
          </p>
          <p className="truncate text-[11px] text-zinc-500">
            {hasPreviewUrl ? 'Auto-opened' : 'Waiting for build'}
          </p>
        </div>
        <Input
          value={previewInput}
          onChange={event => onPreviewInputChange(event.target.value)}
          placeholder="Preview opens automatically after Brok builds"
          className="h-9 min-w-0 flex-1 rounded-full border-zinc-200 bg-white px-4 text-sm shadow-inner"
        />
        <div className="mobile-chip-row flex items-center gap-1.5 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
          <Badge variant={healthTone} className="shrink-0 rounded-full">
            {previewStatus === 'online'
              ? 'Live'
              : previewStatus === 'checking'
                ? 'Checking'
                : previewStatus === 'loaded'
                  ? 'Loaded'
                  : previewStatus === 'offline'
                    ? 'Offline'
                    : 'Ready'}
          </Badge>
          <Button
            variant="default"
            size="icon"
            className="size-9 shrink-0 rounded-full bg-zinc-950 text-white hover:bg-zinc-800"
            onClick={onApply}
            title="Load preview URL"
          >
            <Eye className="size-4" />
            <span className="sr-only">Load preview URL</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0 rounded-full"
                title="Preview options"
              >
                <Globe className="size-4" />
                <span className="sr-only">Preview options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Load custom preview</DropdownMenuLabel>
              {[
                { label: 'localhost:3000', value: 'http://localhost:3000' },
                { label: 'localhost:5173', value: 'http://localhost:5173' },
                { label: '127.0.0.1:8080', value: 'http://127.0.0.1:8080' }
              ].map(shortcut => (
                <DropdownMenuItem
                  key={shortcut.label}
                  onClick={() => onDirectLoad(shortcut.value)}
                >
                  <Globe className="size-4" />
                  {shortcut.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0 rounded-full"
            onClick={onReload}
            title="Reload preview"
          >
            <RefreshCcw className="size-4" />
            <span className="sr-only">Reload preview</span>
          </Button>
          {hasPreviewUrl ? (
            <Button
              asChild
              variant="outline"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              title="Open preview in new tab"
            >
              <a href={previewUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                <span className="sr-only">Open preview in new tab</span>
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              title="Open preview in new tab"
              disabled
            >
              <ExternalLink className="size-4" />
              <span className="sr-only">Open preview in new tab</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-zinc-200/70 bg-white px-4 text-xs text-zinc-500">
        <p className="truncate">
          {previewMessage}
          {previewHealth.httpStatus ? ` (${previewHealth.httpStatus})` : ''}
        </p>
        {latestRun?.previewUrl && (
          <button
            className="hidden max-w-[45%] truncate rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-700 hover:bg-zinc-100 xl:inline-flex"
            onClick={() => onDirectLoad(latestRun.previewUrl ?? previewInput)}
          >
            Use last run: {latestRun.previewUrl}
          </button>
        )}
      </div>

      {runtimeError && (
        <p className="m-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {runtimeError}
        </p>
      )}

      {latestRun?.previewUrl && (
        <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 xl:hidden">
          <Globe className="size-3.5" />
          Suggested from last run:
          <button
            className="truncate text-zinc-950 underline"
            onClick={() => onDirectLoad(latestRun.previewUrl ?? previewInput)}
          >
            {latestRun.previewUrl}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden bg-white">
        {!hasPreviewUrl ? (
          <div className="flex h-full min-h-[330px] w-full items-center justify-center bg-[#fbfaf8] px-6 text-center sm:min-h-[520px]">
            <div className="max-w-sm">
              <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-sm">
                <Monitor className="size-5 text-zinc-500" />
              </div>
              <p className="mt-3 text-sm font-medium text-zinc-950">
                Tell Brok what to build
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                The cloud preview opens here automatically when the first build
                finishes.
              </p>
            </div>
          </div>
        ) : isBlockedPreview ? (
          <div className="flex h-full min-h-[330px] w-full items-center justify-center bg-zinc-50 px-6 text-center text-sm text-zinc-500 sm:min-h-[520px]">
            BrokCode preview cannot render the BrokCode app itself. Load your
            generated app URL instead.
          </div>
        ) : (
          <iframe
            key={previewFrameKey}
            src={previewUrl}
            title="Brok Code browser preview"
            className="h-full min-h-[330px] w-full bg-white sm:min-h-[520px]"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
    </div>
  )
}

function SubagentCard({
  agent,
  selected,
  onSelect
}: {
  agent: BrokCodeSubagent
  selected: boolean
  onSelect: () => void
}) {
  const StatusIcon = statusMeta[agent.status].icon

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
                  agent.status === 'running' && 'animate-pulse'
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
  onFocus
}: {
  agent: BrokCodeSubagent
  onFocus: (agent: BrokCodeSubagent) => void
}) {
  const StatusIcon = statusMeta[agent.status].icon

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
              {agent.status === 'running' ? (
                <span className="typing-dots ml-1 align-middle" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              ) : null}
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
