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
  Pencil,
  Play,
  PlugZap,
  Radar,
  RefreshCcw,
  Rocket,
  Save,
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
  type BrokCodeDeployReadinessDeployment,
  type BrokCodeManagedDeployReadiness,
  summarizeBrokCodeDeployReadiness
} from '@/lib/brokcode/deploy-readiness-client'
import {
  type BrokCodeDiffFile,
  type BrokCodeDiffFileInput,
  type BrokCodeRunDiff,
  buildBrokCodeRunDiff
} from '@/lib/brokcode/diff-summary'
import type { BrokCodeAppliedFileChange } from '@/lib/brokcode/file-operations'
import {
  extractGeneratedBrokCodeFiles,
  GeneratedBrokCodeFile
} from '@/lib/brokcode/generated-files'
import { buildBrokCodeCommandPrompt } from '@/lib/brokcode/generation-prompt'
import {
  type BrokCodeProjectBrain,
  buildBrokCodeProjectBrain,
  normalizeBrokCodeProjectBrain
} from '@/lib/brokcode/project-brain'
import {
  normalizeBrokCodeGeneratedFilePaths,
  shouldRefreshBrokCodeProjectAfterServerRun
} from '@/lib/brokcode/run-sync'
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
type PreviewHealthReason =
  | 'ready'
  | 'blocked'
  | 'not_found'
  | 'blank'
  | 'timeout'
  | 'unreachable'
  | 'http_error'
type BrokCodeBackendProvider = 'none' | 'insforge'
type BrokCodeMobilePane = 'chat' | 'preview' | 'ship'
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
    productBrain?: BrokCodeProjectBrain
    [key: string]: unknown
  } | null
}

type ExecutionStepStatus = 'queued' | 'running' | 'done' | 'error' | 'skipped'

type ExecutionStep = {
  id: string
  label: string
  detail: string
  status: ExecutionStepStatus
}

type ExecutionRun = {
  id: string
  taskId?: string
  statusUrl?: string | null
  eventsUrl?: string | null
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
  checkpointName?: string | null
  projectId?: string | null
  summary: string
  runtime: BrokCodeRuntime
  status: 'done' | 'error'
  previewUrl?: string | null
  deploymentUrl?: string | null
  branch?: string | null
  commitSha?: string | null
  prUrl?: string | null
  diff?: BrokCodeRunDiff | null
  files?: BrokCodeDiffFileInput[] | null
  createdAt: string
}

type BrokCodeRuntimeSandbox = {
  id: string
  projectId: string
  workspaceId: string
  userId: string
  versionId?: string | null
  sessionId?: string | null
  institutionId?: string | null
  courseId?: string | null
  sectionId?: string | null
  assignmentId?: string | null
  appType: 'static_html' | 'vite_react' | 'nextjs' | 'unsupported'
  packageManager: 'none' | 'bun' | 'npm' | 'pnpm' | 'yarn'
  workspacePath: string
  installCommand?: string | null
  devCommand: string
  buildCommand?: string | null
  status:
    | 'preparing'
    | 'installing'
    | 'building'
    | 'running'
    | 'healthy'
    | 'crashed'
    | 'timed_out'
    | 'stopped'
  ports?: Array<{
    name?: string
    port?: number
    protocol?: string
    visibility?: string
  }>
  health?: {
    ok?: boolean
    message?: string
    checkedAt?: string
    url?: string
  } | null
  metadata?: Record<string, unknown> | null
  updatedAt?: string
}

type BrokCodeRuntimeLog = {
  level: 'info' | 'warn' | 'error'
  source: 'install' | 'dev-server' | 'browser' | 'system'
  message: string
  at: string
  command?: string
  file?: string
  line?: number
  column?: number
  stack?: string
}

type BrokCodeRuntimeDiagnostics = {
  runtimeId: string
  status: string
  logs: BrokCodeRuntimeLog[]
  lastError?: BrokCodeRuntimeLog | null
  process?: {
    port?: number
    url?: string
    startedAt?: string
  } | null
}

type BrokCodeProjectFile = {
  id?: string
  path: string
  content: string
  language?: string | null
  updatedAt?: string
}

type BrokCodeDeployReadinessState = {
  readiness: BrokCodeManagedDeployReadiness
  latestDeployment: BrokCodeDeployReadinessDeployment | null
  deployments: BrokCodeDeployReadinessDeployment[]
  previewUrl?: string | null
  deploymentUrl?: string | null
}

type BrokCodeStreamResult = {
  runtime: BrokCodeRuntime
  model?: string
  content: string
  usage?: unknown
  preview_url?: string | null
  task_id?: string | null
  status_url?: string | null
  events_url?: string | null
  file_changes?: BrokCodeAppliedFileChange[]
  note?: string
}

type BrokCodeRetryRequest = {
  command: string
  model?: string
  source?: string
  session_id?: string
  project_id?: string
  backend_provider?: string
  backend_status?: string
  backend_project_url?: string | null
  prefer_pi?: boolean
  require_pi?: boolean
  require_opencode?: boolean
  allow_brok_fallback?: boolean
  retry_of_task_id?: string
}

function normalizeBrokCodeFileChanges(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.filter((change): change is BrokCodeAppliedFileChange => {
    if (!change || typeof change !== 'object') return false
    const candidate = change as Partial<BrokCodeAppliedFileChange>
    return (
      typeof candidate.type === 'string' &&
      typeof candidate.path === 'string' &&
      (candidate.beforeChecksum === null ||
        typeof candidate.beforeChecksum === 'string') &&
      (candidate.afterChecksum === null ||
        typeof candidate.afterChecksum === 'string') &&
      typeof candidate.summary === 'string'
    )
  })
}

type BrokCodeBackgroundTask = {
  id: string
  kind: string
  title: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  metadata?: Record<string, any> | null
  result?: Record<string, any> | null
  error?: string | null
  createdAt?: string
  updatedAt?: string
  startedAt?: string | null
  completedAt?: string | null
}

function getPersistedLifecycleSteps(metadata: Record<string, any>) {
  if (!Array.isArray(metadata.lifecycle)) return null

  const steps = metadata.lifecycle
    .map((step: unknown): ExecutionStep | null => {
      if (!step || typeof step !== 'object') return null
      const record = step as Record<string, unknown>
      const status =
        record.status === 'queued' ||
        record.status === 'running' ||
        record.status === 'done' ||
        record.status === 'error' ||
        record.status === 'skipped'
          ? record.status
          : null
      if (!status) return null

      return {
        id: typeof record.id === 'string' ? record.id : createId('step'),
        label:
          typeof record.label === 'string' ? record.label : 'BrokCode step',
        detail:
          typeof record.detail === 'string'
            ? record.detail
            : 'Recovered from the background task ledger.',
        status
      }
    })
    .filter((step): step is ExecutionStep => Boolean(step))

  return steps.length > 0 ? steps : null
}

function createExecutionRunFromTask(
  task: BrokCodeBackgroundTask
): ExecutionRun {
  const metadata = task.metadata ?? {}
  const result = task.result ?? {}
  const command =
    typeof metadata.command === 'string' && metadata.command.trim()
      ? metadata.command.trim()
      : task.title
  const progress =
    typeof metadata.progress === 'number'
      ? Math.max(0, Math.min(100, metadata.progress))
      : task.status === 'succeeded'
        ? 100
        : task.status === 'failed' || task.status === 'cancelled'
          ? 100
          : 18
  const runtime =
    result.runtime === 'pi' ||
    result.runtime === 'opencode' ||
    result.runtime === 'brok'
      ? result.runtime
      : 'brok'
  const previewUrl =
    typeof result.previewUrl === 'string' ? result.previewUrl : null
  const startedAt =
    typeof task.startedAt === 'string'
      ? Date.parse(task.startedAt)
      : typeof task.createdAt === 'string'
        ? Date.parse(task.createdAt)
        : Date.now()
  const finishedAt =
    typeof task.completedAt === 'string'
      ? Date.parse(task.completedAt)
      : undefined
  const running = task.status === 'queued' || task.status === 'running'
  const failed = task.status === 'failed' || task.status === 'cancelled'
  const persistedLifecycleSteps = getPersistedLifecycleSteps(metadata)
  const steps =
    persistedLifecycleSteps ??
    executionStepTemplate.map(step => {
      if (step.id === 'parse') {
        return { ...step, status: 'done' as ExecutionStepStatus }
      }
      if (step.id === 'plan') {
        return {
          ...step,
          status:
            progress >= 18
              ? ('done' as const)
              : running
                ? ('running' as const)
                : failed
                  ? ('error' as const)
                  : ('queued' as const),
          detail:
            typeof metadata.runtimePreference === 'string'
              ? `Runtime preference: ${metadata.runtimePreference}.`
              : step.detail
        }
      }
      if (step.id === 'execute') {
        return {
          ...step,
          status:
            task.status === 'succeeded'
              ? ('done' as const)
              : failed
                ? ('error' as const)
                : progress >= 18
                  ? ('running' as const)
                  : ('queued' as const),
          detail:
            Array.isArray(metadata.events) && metadata.events.length > 0
              ? String(
                  metadata.events[metadata.events.length - 1]?.message ??
                    step.detail
                )
              : step.detail
        }
      }
      if (step.id === 'validate') {
        return {
          ...step,
          status:
            task.status === 'succeeded'
              ? ('done' as const)
              : failed
                ? ('error' as const)
                : progress >= 72
                  ? ('running' as const)
                  : ('queued' as const),
          detail: previewUrl ? 'Cloud preview URL recorded.' : step.detail
        }
      }
      return {
        ...step,
        status:
          task.status === 'succeeded'
            ? ('done' as const)
            : failed
              ? ('error' as const)
              : ('queued' as const),
        detail:
          task.status === 'succeeded'
            ? 'Recovered from the background task ledger.'
            : failed
              ? task.error || 'Recovered failed task from the ledger.'
              : step.detail
      }
    })

  return {
    id: `task-${task.id}`,
    taskId: task.id,
    statusUrl: `/api/tasks/${task.id}`,
    eventsUrl: `/api/tasks/${task.id}/events`,
    command,
    runtime,
    status: task.status === 'succeeded' ? 'done' : failed ? 'error' : 'running',
    startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
    finishedAt: Number.isFinite(finishedAt) ? finishedAt : undefined,
    note:
      task.status === 'succeeded'
        ? 'Recovered completed run from the background task ledger.'
        : failed
          ? task.error ||
            'Recovered failed run from the background task ledger.'
          : 'Recovered active run from the background task ledger.',
    previewUrl,
    steps
  }
}

type GithubRepoContext = {
  repository: string | null
  remoteUrl: string | null
  currentBranch: string | null
  defaultBranch: string | null
  commitSha: string | null
}

type GithubRepositoryOption = {
  fullName: string
  defaultBranch?: string | null
  private?: boolean
  htmlUrl?: string | null
  pushedAt?: string | null
}

type PreviewHealth = {
  status: PreviewHealthStatus
  message: string
  reason?: PreviewHealthReason
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
    const completed = run.steps.filter(
      step => step.status === 'done' || step.status === 'skipped'
    ).length
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

const BROKCODE_BROWSER_RUN_TIMEOUT_MS = 90_000

const builderQuickPrompts = [
  'Build a polished landing page',
  'Make this app cleaner on mobile',
  'Fix the preview and explain what changed'
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

function buildCommandPrompt(command: string) {
  return buildBrokCodeCommandPrompt(command)
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
    if (parsed.pathname.startsWith('/brokcode/apps/')) {
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

function formatBuilderContentForChat({
  content,
  files,
  previewUrl
}: {
  content: string
  files?: GeneratedPreviewFile[]
  previewUrl?: string | null
}) {
  const generatedFiles = files ?? extractGeneratedPreviewFiles(content)
  const withoutCode = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/```[\s\S]*$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const firstUsefulLine =
    withoutCode
      .split('\n')
      .map(line => line.trim())
      .find(line => line && !/^done\.?$/i.test(line)) ?? ''

  if (generatedFiles.length > 0) {
    const fileList = generatedFiles
      .slice(0, 4)
      .map(file => file.path)
      .join(', ')
    const extraCount = generatedFiles.length > 4 ? generatedFiles.length - 4 : 0
    return [
      previewUrl
        ? 'Done. I updated the project files and opened the preview on the right.'
        : 'I am writing the project files now.',
      fileList
        ? `Files: ${fileList}${extraCount > 0 ? `, +${extraCount} more` : ''}.`
        : null,
      firstUsefulLine && firstUsefulLine.length < 180 ? firstUsefulLine : null
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n\n')
  }

  if (content.includes('```')) {
    return [
      firstUsefulLine || 'I am writing the project files now.',
      'I will keep the raw code out of the chat and open the preview when it is ready.'
    ].join('\n\n')
  }

  return content.length > 1400 ? `${content.slice(0, 1397)}...` : content
}

async function readBrokCodeExecutionStream(
  response: Response,
  onEvent: (
    event:
      | {
          type: 'task'
          taskId: string
          statusUrl?: string | null
          eventsUrl?: string | null
        }
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

    if (eventType === 'task') {
      const taskId =
        typeof payload.task_id === 'string' ? payload.task_id : null
      if (taskId) {
        onEvent({
          type: 'task',
          taskId,
          statusUrl:
            typeof payload.status_url === 'string' ? payload.status_url : null,
          eventsUrl:
            typeof payload.events_url === 'string' ? payload.events_url : null
        })
      }
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
    task_id: typeof result?.task_id === 'string' ? result.task_id : null,
    status_url:
      typeof result?.status_url === 'string' ? result.status_url : null,
    events_url:
      typeof result?.events_url === 'string' ? result.events_url : null,
    file_changes: normalizeBrokCodeFileChanges(result?.file_changes),
    note: typeof result?.note === 'string' ? result.note : undefined
  }
}

async function readBackgroundTaskEventStream(
  response: Response,
  onTask: (task: BrokCodeBackgroundTask) => void
) {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Task event stream did not include a response body.')
  }

  const decoder = new TextDecoder()
  let buffer = ''

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

    if (eventType !== 'task.update' || dataLines.length === 0) return

    try {
      const payload = JSON.parse(dataLines.join('\n')) as {
        task?: BrokCodeBackgroundTask
      }
      if (payload.task?.id) {
        onTask(payload.task)
      }
    } catch {}
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
}

type BrokCodeAppProps = {
  initialPrompt?: string
  initialProjectId?: string | null
  autoStart?: boolean
  connectGithub?: boolean
  accountEmail?: string
}

export function normalizeInitialBrokCodeProjectId(projectId?: string | null) {
  const normalized = projectId?.trim()
  return normalized ? normalized : ''
}

export function resolveBrokCodeActiveProjectId(params: {
  currentProjectId: string
  requestedProjectId?: string | null
  projects: Pick<BrokCodeProject, 'id'>[]
}) {
  const { currentProjectId, requestedProjectId, projects } = params
  const normalizedCurrent = normalizeInitialBrokCodeProjectId(currentProjectId)
  if (
    normalizedCurrent &&
    projects.some(project => project.id === normalizedCurrent)
  ) {
    return normalizedCurrent
  }

  const normalizedRequested =
    normalizeInitialBrokCodeProjectId(requestedProjectId)
  if (
    normalizedRequested &&
    projects.some(project => project.id === normalizedRequested)
  ) {
    return normalizedRequested
  }

  return projects[0]?.id ?? ''
}

export function BrokCodeApp({
  initialPrompt = '',
  initialProjectId = null,
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
  const commandInputRef = useRef<HTMLTextAreaElement>(null)
  const [selectedId, setSelectedId] = useState('')
  const [input, setInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [runHintIndex, setRunHintIndex] = useState(0)
  const [activeRuntime, setActiveRuntime] =
    useState<BrokCodeRuntime>('not_connected')
  const [apiKey] = useState<string | null>(null)
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
  const [reconnectingTaskId, setReconnectingTaskId] = useState<string | null>(
    null
  )
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [runtimeBootstrapped, setRuntimeBootstrapped] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployReadiness, setDeployReadiness] =
    useState<BrokCodeDeployReadinessState | null>(null)
  const [deployReadinessLoading, setDeployReadinessLoading] = useState(false)
  const [deployReadinessError, setDeployReadinessError] = useState<
    string | null
  >(null)
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
  const [githubExportPath, setGithubExportPath] = useState('')
  const [githubRepositories, setGithubRepositories] = useState<
    GithubRepositoryOption[]
  >([])
  const [githubRepositoriesLoading, setGithubRepositoriesLoading] =
    useState(false)
  const [versions, setVersions] = useState<BrokCodeVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [projects, setProjects] = useState<BrokCodeProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState(() =>
    normalizeInitialBrokCodeProjectId(initialProjectId)
  )
  const [projectFiles, setProjectFiles] = useState<BrokCodeProjectFile[]>([])
  const [projectFilesLoading, setProjectFilesLoading] = useState(false)
  const [projectFilesError, setProjectFilesError] = useState<string | null>(
    null
  )
  const [selectedFilePath, setSelectedFilePath] = useState('')
  const selectedFilePathRef = useRef('')
  const [fileDraft, setFileDraft] = useState('')
  const [fileEditMode, setFileEditMode] = useState(false)
  const [fileSaving, setFileSaving] = useState(false)
  const [runDiffs, setRunDiffs] = useState<BrokCodeRunDiff[]>([])
  const [selectedRunDiffId, setSelectedRunDiffId] = useState('')
  const [selectedDiffFilePath, setSelectedDiffFilePath] = useState('')
  const [projectRuntime, setProjectRuntime] =
    useState<BrokCodeRuntimeSandbox | null>(null)
  const [runtimeDiagnostics, setRuntimeDiagnostics] =
    useState<BrokCodeRuntimeDiagnostics | null>(null)
  const [projectRuntimeLoading, setProjectRuntimeLoading] = useState(false)
  const [backendSaving, setBackendSaving] = useState(false)
  const [backendProvisioning, setBackendProvisioning] = useState(false)
  const [backendChecking, setBackendChecking] = useState(false)
  const [backendProjectName, setBackendProjectName] = useState('BrokCode app')
  const [insForgeProjectUrl, setInsForgeProjectUrl] = useState('')
  const [insForgeDashboardUrl, setInsForgeDashboardUrl] = useState('')
  const [insForgeAdminKey, setInsForgeAdminKey] = useState('')
  const [mobilePane, setMobilePane] = useState<BrokCodeMobilePane>('chat')

  const setCommandInput = useCallback((value: string) => {
    const commandInputElement =
      commandInputRef.current ??
      document.querySelector<HTMLTextAreaElement>(
        '[data-testid="brokcode-command-input"]'
      )
    if (commandInputElement && commandInputElement.value !== value) {
      commandInputElement.value = value
    }

    setInput(current => (current === value ? current : value))
  }, [])

  useEffect(() => {
    const syncFromDom = () => {
      const commandInputElement =
        commandInputRef.current ??
        document.querySelector<HTMLTextAreaElement>(
          '[data-testid="brokcode-command-input"]'
        )
      if (!commandInputElement) return

      const nextValue = commandInputElement.value
      setCommandInput(nextValue)
    }

    syncFromDom()
    const timer = window.setInterval(syncFromDom, 100)

    return () => {
      window.clearInterval(timer)
    }
  }, [setCommandInput])
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

      localStorage.removeItem(BROK_KEY_STORAGE)

      if (cancelled) return

      try {
        const response = await fetch('/api/brokcode/key')
        const body = await response.json().catch(() => null)
        if (response.ok && body?.key) {
          const defaultSessionId =
            typeof body.key.defaultSessionId === 'string'
              ? body.key.defaultSessionId
              : ''
          if (defaultSessionId) {
            setSyncSessionId(defaultSessionId)
            localStorage.setItem(BROK_SESSION_STORAGE, defaultSessionId)
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
  const projectBrain = useMemo(() => {
    const persistedBrain = normalizeBrokCodeProjectBrain(
      activeProject?.metadata?.productBrain
    )
    if (persistedBrain) return persistedBrain

    const latestUserMessage = [...messages]
      .reverse()
      .find(message => message.role === 'user')
    const latestCommand =
      versions[0]?.command ?? latestUserMessage?.content ?? input

    return buildBrokCodeProjectBrain({
      projectName: activeProject?.name ?? 'BrokCode App',
      command: latestCommand,
      files: projectFiles.map(file => ({
        path: file.path,
        content: file.content,
        language: file.language ?? null
      })),
      backend: activeBackend
    })
  }, [activeBackend, activeProject, input, messages, projectFiles, versions])
  const selectedProjectFile =
    projectFiles.find(file => file.path === selectedFilePath) ??
    projectFiles[0] ??
    null
  const hasUnsavedFileChanges =
    Boolean(selectedProjectFile) && fileDraft !== selectedProjectFile?.content
  const selectedRunDiff =
    runDiffs.find(diff => diff.id === selectedRunDiffId) ?? runDiffs[0] ?? null
  const selectedDiffFile =
    selectedRunDiff?.files.find(file => file.path === selectedDiffFilePath) ??
    selectedRunDiff?.files[0] ??
    null

  useEffect(() => {
    selectedFilePathRef.current = selectedFilePath
  }, [selectedFilePath])

  useEffect(() => {
    const versionDiffs: BrokCodeRunDiff[] = versions.flatMap(version =>
      version.diff
        ? [
            {
              ...version.diff,
              versionId: version.diff.versionId ?? version.id
            }
          ]
        : []
    )

    if (versionDiffs.length === 0) return

    setRunDiffs(current => {
      const byId = new Map(current.map(diff => [diff.id, diff]))
      versionDiffs.forEach(diff => byId.set(diff.id, diff))
      return Array.from(byId.values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8)
    })
    setSelectedRunDiffId(current => current || versionDiffs[0]?.id || '')
    setSelectedDiffFilePath(
      current => current || versionDiffs[0]?.files[0]?.path || ''
    )
  }, [versions])

  const activeSyncSession = useMemo(
    () =>
      syncedSessions.find(session => session.id === syncSessionId) ??
      syncedSessions[0] ??
      null,
    [syncSessionId, syncedSessions]
  )

  const hasAccountRuntime = Boolean(accountEmail)
  const hasLiveRuntime =
    hasAccountRuntime || Boolean(apiKey && isValidBrokApiKey(apiKey))
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

  const refreshGithubRepositories = useCallback(
    async (key = apiKey) => {
      if (key && !isValidBrokApiKey(key)) {
        setGithubRepositories([])
        return []
      }

      setGithubRepositoriesLoading(true)
      try {
        const response = await fetch('/api/brokcode/github/repositories', {
          headers: getAuthHeaders(key)
        })
        const body = await response.json().catch(() => null)
        const repositories = Array.isArray(body?.repositories)
          ? (body.repositories as GithubRepositoryOption[])
          : []

        if (!response.ok) {
          throw new Error(
            body?.message ??
              body?.error?.message ??
              'Could not load GitHub repositories.'
          )
        }

        setGithubRepositories(repositories)
        if (repositories.length > 0) {
          setGithubRepository(current => current || repositories[0]!.fullName)
          setGithubBaseBranch(current =>
            current && current !== 'main'
              ? current
              : repositories[0]!.defaultBranch || 'main'
          )
        }
        return repositories
      } catch (error) {
        setGithubRepositories([])
        setGithubMessage(
          error instanceof Error
            ? error.message
            : 'Could not load GitHub repositories.'
        )
        return []
      } finally {
        setGithubRepositoriesLoading(false)
      }
    },
    [apiKey, getAuthHeaders]
  )

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

  const refreshBrokCodeTasks = useCallback(
    async (key = apiKey) => {
      if (key && !isValidBrokApiKey(key)) return

      try {
        const params = new URLSearchParams({
          limit: '12',
          chatId: syncSessionId
        })
        const response = await fetch(`/api/tasks?${params}`, {
          headers: getAuthHeaders(key)
        })
        if (!response.ok) return

        const body = await response.json().catch(() => null)
        const taskRuns = Array.isArray(body?.tasks)
          ? (body.tasks as BrokCodeBackgroundTask[])
              .filter(task => task.kind === 'brokcode')
              .map(createExecutionRunFromTask)
          : []

        if (taskRuns.length === 0) return

        setExecutionRuns(current => {
          const currentKeys = new Set(current.map(run => run.taskId ?? run.id))
          const merged = [
            ...current.map(run => {
              const replacement = run.taskId
                ? taskRuns.find(taskRun => taskRun.taskId === run.taskId)
                : null
              return replacement ?? run
            }),
            ...taskRuns.filter(run => !currentKeys.has(run.taskId ?? run.id))
          ]
          return merged.sort((a, b) => b.startedAt - a.startedAt).slice(0, 8)
        })
      } catch {}
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
          resolveBrokCodeActiveProjectId({
            currentProjectId: current,
            requestedProjectId: initialProjectId,
            projects: nextProjects
          })
        )
      } catch (error) {
        setRuntimeError(
          error instanceof Error ? error.message : 'Could not load projects.'
        )
      }
    },
    [apiKey, getAuthHeaders, initialProjectId]
  )

  const refreshProjectRuntime = useCallback(
    async (project = activeProject, key = apiKey) => {
      if (!project?.id) {
        setProjectRuntime(null)
        return null
      }
      if (key && !isValidBrokApiKey(key)) {
        setProjectRuntime(null)
        return null
      }

      setProjectRuntimeLoading(true)
      try {
        const response = await fetch(
          `/api/brokcode/projects/${encodeURIComponent(project.id)}/runtime`,
          {
            headers: getAuthHeaders(key)
          }
        )
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(body?.error ?? 'Runtime lookup failed.')
        }

        const runtime =
          body?.runtime && typeof body.runtime === 'object'
            ? (body.runtime as BrokCodeRuntimeSandbox)
            : null
        setProjectRuntime(runtime)
        return runtime
      } catch (error) {
        setProjectRuntime(null)
        setRuntimeError(
          error instanceof Error
            ? error.message
            : 'Could not load project runtime.'
        )
        return null
      } finally {
        setProjectRuntimeLoading(false)
      }
    },
    [activeProject, apiKey, getAuthHeaders]
  )

  const refreshProjectFiles = useCallback(
    async (project = activeProject, key = apiKey) => {
      if (!project?.id) {
        setProjectFiles([])
        setSelectedFilePath('')
        setFileDraft('')
        return []
      }
      if (key && !isValidBrokApiKey(key)) {
        setProjectFiles([])
        return []
      }

      setProjectFilesLoading(true)
      setProjectFilesError(null)
      try {
        const response = await fetch(
          `/api/brokcode/projects/${encodeURIComponent(project.id)}/files`,
          {
            headers: getAuthHeaders(key)
          }
        )
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(body?.error ?? 'Could not load project files.')
        }

        const files = Array.isArray(body?.files)
          ? (body.files as BrokCodeProjectFile[])
          : []
        setProjectFiles(files)
        const currentFilePath = selectedFilePathRef.current
        const nextSelected =
          currentFilePath && files.some(file => file.path === currentFilePath)
            ? currentFilePath
            : (files[0]?.path ?? '')
        setSelectedFilePath(nextSelected)
        setFileDraft(
          files.find(file => file.path === nextSelected)?.content ?? ''
        )
        setFileEditMode(false)
        return files
      } catch (error) {
        setProjectFilesError(
          error instanceof Error
            ? error.message
            : 'Could not load project files.'
        )
        return []
      } finally {
        setProjectFilesLoading(false)
      }
    },
    [activeProject, apiKey, getAuthHeaders]
  )

  const refreshDeployReadiness = useCallback(
    async (project = activeProject, key = apiKey) => {
      if (!project?.id) {
        setDeployReadiness(null)
        setDeployReadinessError(null)
        return null
      }
      if (key && !isValidBrokApiKey(key)) {
        setDeployReadiness(null)
        setDeployReadinessError(null)
        return null
      }

      setDeployReadinessLoading(true)
      setDeployReadinessError(null)
      try {
        const response = await fetch(
          `/api/brokcode/deploy?projectId=${encodeURIComponent(project.id)}&source=browser`,
          {
            headers: getAuthHeaders(key)
          }
        )
        const body = await response.json().catch(() => null)
        if (!response.ok || !body?.readiness) {
          throw new Error(
            body?.error?.message ?? 'Could not check deploy readiness.'
          )
        }

        const nextReadiness: BrokCodeDeployReadinessState = {
          readiness: body.readiness as BrokCodeManagedDeployReadiness,
          latestDeployment:
            body.latestDeployment && typeof body.latestDeployment === 'object'
              ? (body.latestDeployment as BrokCodeDeployReadinessDeployment)
              : null,
          deployments: Array.isArray(body.deployments)
            ? (body.deployments as BrokCodeDeployReadinessDeployment[])
            : [],
          previewUrl:
            typeof body.previewUrl === 'string' ? body.previewUrl : null,
          deploymentUrl:
            typeof body.deploymentUrl === 'string' ? body.deploymentUrl : null
        }
        setDeployReadiness(nextReadiness)
        return nextReadiness
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not check deploy readiness.'
        setDeployReadinessError(message)
        return null
      } finally {
        setDeployReadinessLoading(false)
      }
    },
    [activeProject, apiKey, getAuthHeaders]
  )

  const fetchProjectFilesForDiff = useCallback(
    async (project = activeProject, key = apiKey) => {
      if (!project?.id || (key && !isValidBrokApiKey(key))) return []

      const response = await fetch(
        `/api/brokcode/projects/${encodeURIComponent(project.id)}/files`,
        {
          headers: getAuthHeaders(key)
        }
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) return []

      return Array.isArray(body?.files)
        ? (body.files as BrokCodeProjectFile[])
        : []
    },
    [activeProject, apiKey, getAuthHeaders]
  )

  const refreshRuntimeDiagnostics = useCallback(
    async (runtime = projectRuntime) => {
      if (!runtime?.id) {
        setRuntimeDiagnostics(null)
        return null
      }

      try {
        const response = await fetch(
          `/api/brokcode/runtime/${encodeURIComponent(runtime.id)}/logs`,
          { cache: 'no-store' }
        )
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(body?.error ?? 'Runtime diagnostics lookup failed.')
        }

        const diagnostics =
          body?.diagnostics && typeof body.diagnostics === 'object'
            ? (body.diagnostics as BrokCodeRuntimeDiagnostics)
            : null
        setRuntimeDiagnostics(diagnostics)
        return diagnostics
      } catch {
        return null
      }
    },
    [projectRuntime]
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
        if (
          context.currentBranch &&
          context.currentBranch !== context.defaultBranch
        ) {
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

  function selectGithubRepository(value: string) {
    setGithubRepository(value)
    const repository = githubRepositories.find(
      candidate => candidate.fullName === value
    )
    if (repository?.defaultBranch) {
      setGithubBaseBranch(repository.defaultBranch)
    }
  }

  useEffect(() => {
    void refreshProjectRuntime()
  }, [refreshProjectRuntime])

  useEffect(() => {
    void refreshProjectFiles()
  }, [refreshProjectFiles])

  useEffect(() => {
    void refreshDeployReadiness()
  }, [refreshDeployReadiness])

  useEffect(() => {
    if (!activeProject?.slug) return
    setGithubExportPath(current => current || activeProject.slug)
  }, [activeProject?.slug])

  useEffect(() => {
    if (!projectRuntime?.id) {
      setRuntimeDiagnostics(null)
      return
    }

    void refreshRuntimeDiagnostics(projectRuntime)
    const interval = window.setInterval(() => {
      void refreshRuntimeDiagnostics(projectRuntime)
    }, 2500)

    return () => window.clearInterval(interval)
  }, [projectRuntime, refreshRuntimeDiagnostics])

  async function ensureProjectForRun(
    command: string,
    preferredProjectId?: string
  ) {
    if (preferredProjectId) {
      const existingProject = projects.find(
        project => project.id === preferredProjectId
      )
      if (existingProject) {
        setActiveProjectId(existingProject.id)
        return existingProject
      }

      const response = await fetch('/api/brokcode/projects', {
        headers: getAuthHeaders(apiKey)
      })
      const body = await response.json().catch(() => null)
      if (response.ok && Array.isArray(body?.projects)) {
        const nextProjects = body.projects as BrokCodeProject[]
        setProjects(nextProjects)
        const preferredProject = nextProjects.find(
          project => project.id === preferredProjectId
        )
        if (preferredProject) {
          setActiveProjectId(preferredProject.id)
          return preferredProject
        }
      }
    }

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

  async function createProjectRuntimeRecord({
    project,
    status,
    versionId
  }: {
    project: BrokCodeProject
    status: BrokCodeRuntimeSandbox['status']
    versionId?: string | null
  }) {
    const response = await fetch(
      `/api/brokcode/projects/${encodeURIComponent(project.id)}/runtime`,
      {
        method: 'POST',
        headers: {
          ...getAuthHeaders(apiKey),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: syncSessionId,
          versionId: versionId ?? null,
          status,
          force: true
        })
      }
    )
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(body?.error ?? 'Could not create runtime contract.')
    }

    const runtime =
      body?.runtime && typeof body.runtime === 'object'
        ? (body.runtime as BrokCodeRuntimeSandbox)
        : null
    setProjectRuntime(runtime)
    return runtime
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
    if (githubStatus !== 'connected') return
    void refreshGithubRepositories()
  }, [githubStatus, refreshGithubRepositories])

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
    void refreshBrokCodeTasks(apiKey)
    void refreshRepoContext(apiKey)
    void refreshProjects(apiKey)
  }, [
    apiKey,
    hasLiveRuntime,
    refreshBrokCodeTasks,
    refreshProjects,
    refreshRepoContext,
    refreshSyncedSessions,
    refreshVersions
  ])

  useEffect(() => {
    if (!hasLiveRuntime || (apiKey && !isValidBrokApiKey(apiKey))) return
    void refreshVersions(apiKey)
    void refreshBrokCodeTasks(apiKey)
  }, [
    apiKey,
    hasLiveRuntime,
    refreshBrokCodeTasks,
    refreshVersions,
    syncSessionId
  ])

  useEffect(() => {
    if (!hasLiveRuntime || (apiKey && !isValidBrokApiKey(apiKey))) return

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void refreshSyncedSessions(apiKey)
      void refreshBrokCodeTasks(apiKey)
    }, 15000)

    return () => window.clearInterval(timer)
  }, [apiKey, hasLiveRuntime, refreshBrokCodeTasks, refreshSyncedSessions])

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

  function mergeExecutionRunFromTask(task: BrokCodeBackgroundTask) {
    const nextRun = createExecutionRunFromTask(task)

    setExecutionRuns(current => {
      const hasExisting = current.some(
        run => run.taskId === task.id || run.id === nextRun.id
      )
      const merged = hasExisting
        ? current.map(run =>
            run.taskId === task.id || run.id === nextRun.id ? nextRun : run
          )
        : [nextRun, ...current]

      return merged.sort((a, b) => b.startedAt - a.startedAt).slice(0, 8)
    })

    const previewUrl =
      typeof task.result?.previewUrl === 'string'
        ? task.result.previewUrl
        : null
    if (previewUrl) {
      loadPreviewUrlIfAllowed(previewUrl)
    }
  }

  async function reconnectExecutionRun(run: ExecutionRun) {
    if (!run.eventsUrl || !run.taskId || reconnectingTaskId) return

    setReconnectingTaskId(run.taskId)
    setRuntimeError(null)
    try {
      const response = await fetch(run.eventsUrl, {
        headers: getAuthHeaders()
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Could not reconnect to task events.')
      }

      await readBackgroundTaskEventStream(response, task => {
        mergeExecutionRunFromTask(task)
      })
      await refreshBrokCodeTasks(apiKey)
    } catch (error) {
      setRuntimeError(
        error instanceof Error
          ? error.message
          : 'Could not reconnect to task events.'
      )
    } finally {
      setReconnectingTaskId(null)
    }
  }

  async function cancelExecutionRun(run: ExecutionRun) {
    if (!run.taskId || cancellingTaskId) return

    setCancellingTaskId(run.taskId)
    setRuntimeError(null)
    try {
      const response = await fetch(`/api/tasks/${run.taskId}/cancel`, {
        method: 'POST',
        headers: getAuthHeaders()
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.error ?? 'Could not cancel task.')
      }

      if (body?.task) {
        mergeExecutionRunFromTask(body.task as BrokCodeBackgroundTask)
      } else {
        await refreshBrokCodeTasks(apiKey)
      }
    } catch (error) {
      setRuntimeError(
        error instanceof Error ? error.message : 'Could not cancel task.'
      )
    } finally {
      setCancellingTaskId(null)
    }
  }

  async function retryExecutionRun(run: ExecutionRun) {
    if (!run.taskId) {
      await runCommand(run.command)
      return
    }

    setRuntimeError(null)
    try {
      const response = await fetch(`/api/tasks/${run.taskId}/retry`, {
        method: 'POST',
        headers: getAuthHeaders()
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.error ?? 'Could not retry task.')
      }

      const retry =
        body?.retry && typeof body.retry === 'object'
          ? (body.retry as BrokCodeRetryRequest)
          : null
      if (!retry?.command) {
        throw new Error('Retry endpoint did not return a command.')
      }

      if (body?.task) {
        mergeExecutionRunFromTask(body.task as BrokCodeBackgroundTask)
      }

      await runCommand(retry.command, { retryRequest: retry })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not retry task.'
      setRuntimeError(message)
      toast.error(message)
    }
  }

  function selectProjectFile(path: string) {
    if (hasUnsavedFileChanges) {
      const proceed = window.confirm(
        'You have unsaved file edits. Discard them and switch files?'
      )
      if (!proceed) return
    }

    const file = projectFiles.find(candidate => candidate.path === path)
    setSelectedFilePath(path)
    setFileDraft(file?.content ?? '')
    setFileEditMode(false)
  }

  async function saveProjectFile() {
    if (!activeProject?.id || !selectedProjectFile) return

    setFileSaving(true)
    setRuntimeError(null)
    try {
      const response = await fetch(
        `/api/brokcode/projects/${encodeURIComponent(activeProject.id)}/files`,
        {
          method: 'PUT',
          headers: {
            ...getAuthHeaders(apiKey),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            path: selectedProjectFile.path,
            content: fileDraft,
            language: selectedProjectFile.language
          })
        }
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.error ?? 'Could not save file.')
      }
      await refreshProjectFiles(activeProject)
      await refreshDeployReadiness(activeProject)
      await refreshProjectRuntime(activeProject)
      setPreviewFrameKey(key => key + 1)
      setFileEditMode(false)
    } catch (error) {
      setRuntimeError(
        error instanceof Error ? error.message : 'Could not save file.'
      )
    } finally {
      setFileSaving(false)
    }
  }

  function recordRunDiff(diff: BrokCodeRunDiff) {
    setRunDiffs(current =>
      [diff, ...current.filter(existing => existing.id !== diff.id)].slice(0, 8)
    )
    setSelectedRunDiffId(diff.id)
    setSelectedDiffFilePath(diff.files[0]?.path ?? '')
  }

  function attachVersionToRunDiff(diffId: string, versionId: string) {
    setRunDiffs(current =>
      current.map(diff => (diff.id === diffId ? { ...diff, versionId } : diff))
    )
  }

  function openDiffFileInEditor(path: string) {
    selectProjectFile(path)
    setSelectedFilePath(path)
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
      taskId?: string | null
      statusUrl?: string | null
      eventsUrl?: string | null
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
              taskId: updates.taskId ?? run.taskId,
              statusUrl: updates.statusUrl ?? run.statusUrl,
              eventsUrl: updates.eventsUrl ?? run.eventsUrl,
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
    setMobilePane('preview')
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
    setMobilePane(current => (current === 'chat' ? 'preview' : current))
  }, [
    activeProject,
    activeProject?.deploymentUrl,
    activeProject?.id,
    activeProject?.previewUrl,
    previewUrl
  ])

  const checkPreviewHealth = useCallback(
    async (target = previewUrl) => {
      const normalized = normalizePreviewUrl(target)
      if (!target.trim()) {
        setPreviewHealth({
          status: 'idle',
          reason: undefined,
          message:
            'Preview appears here after a run or when you paste an app URL.'
        })
        return
      }

      if (!normalized || isBrokCodeWorkspaceUrl(normalized)) {
        setPreviewHealth({
          status: 'offline',
          reason: 'blocked',
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

        const reason =
          typeof body?.reason === 'string'
            ? (body.reason as PreviewHealthReason)
            : body?.ok
              ? 'ready'
              : 'unreachable'

        setPreviewHealth({
          status: body?.ok ? 'online' : 'offline',
          reason,
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
          reason: 'unreachable',
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
        reason: undefined,
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
    checkpointName,
    projectId,
    summary,
    runtime,
    status,
    previewUrl,
    deploymentUrl,
    prUrl,
    diff,
    files
  }: {
    command: string
    checkpointName?: string | null
    projectId?: string | null
    summary: string
    runtime: BrokCodeRuntime
    status: 'done' | 'error'
    previewUrl?: string | null
    deploymentUrl?: string | null
    prUrl?: string | null
    diff?: BrokCodeRunDiff | null
    files?: BrokCodeDiffFileInput[] | null
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
          checkpoint_name: checkpointName ?? null,
          project_id: projectId ?? null,
          summary:
            summary.length > 1800 ? `${summary.slice(0, 1797)}...` : summary,
          runtime,
          status,
          preview_url: previewUrl ?? null,
          deployment_url: deploymentUrl ?? null,
          branch: githubHeadBranch || repoContext?.currentBranch || null,
          commit_sha: repoContext?.commitSha || null,
          pr_url: prUrl ?? null,
          diff: diff ?? null,
          files: files ?? null
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

  function getVersionSnapshotFiles(version: BrokCodeVersion) {
    return Array.isArray(version.files) ? version.files : []
  }

  async function renameVersionCheckpoint(version: BrokCodeVersion) {
    const name = window.prompt(
      'Checkpoint name',
      version.checkpointName ?? version.command
    )
    if (name === null) return

    const response = await fetch(
      `/api/brokcode/versions/${encodeURIComponent(version.id)}`,
      {
        method: 'PATCH',
        headers: {
          ...getAuthHeaders(apiKey),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ checkpoint_name: name.trim() || null })
      }
    )
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.version) {
      throw new Error(body?.error ?? 'Could not rename checkpoint.')
    }

    const updated = body.version as BrokCodeVersion
    setVersions(current =>
      current.map(candidate =>
        candidate.id === updated.id ? updated : candidate
      )
    )
    toast.success('Checkpoint renamed.')
  }

  async function restoreVersionSnapshot(version: BrokCodeVersion) {
    if (!activeProject?.id) return
    const files = getVersionSnapshotFiles(version)
    if (files.length === 0) {
      toast.error('This version does not include a restorable file snapshot.')
      return
    }
    if (hasUnsavedFileChanges) {
      const proceed = window.confirm(
        'You have unsaved file edits. Restore this version and discard them?'
      )
      if (!proceed) return
    }

    const currentFiles = await fetchProjectFilesForDiff(activeProject)
    const snapshotPaths = new Set(files.map(file => file.path))
    const operations = [
      ...files.map(file => ({
        type: 'replace_file' as const,
        path: file.path,
        content: file.content,
        summary: `Restored ${file.path} from ${version.checkpointName ?? version.command}.`
      })),
      ...currentFiles
        .filter(file => !snapshotPaths.has(file.path))
        .map(file => ({
          type: 'delete_file' as const,
          path: file.path,
          summary: `Removed ${file.path} during version restore.`
        }))
    ]

    const response = await fetch(
      `/api/brokcode/projects/${encodeURIComponent(activeProject.id)}/files`,
      {
        method: 'POST',
        headers: {
          ...getAuthHeaders(apiKey),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          operations,
          conflictResolution: 'apply_anyway'
        })
      }
    )
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(body?.error ?? 'Could not restore version.')
    }

    await refreshProjectFiles(activeProject)
    await refreshDeployReadiness(activeProject)
    const runtime = await createProjectRuntimeRecord({
      project: activeProject,
      status: 'healthy',
      versionId: version.id
    })
    if (runtime) {
      setPreviewFrameKey(key => key + 1)
    }
    toast.success('Version restored.')
  }

  async function duplicateVersionSnapshot(version: BrokCodeVersion) {
    const files = getVersionSnapshotFiles(version)
    if (files.length === 0) {
      toast.error('This version does not include files to duplicate.')
      return
    }

    const response = await fetch('/api/brokcode/projects', {
      method: 'POST',
      headers: {
        ...getAuthHeaders(apiKey),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `${version.checkpointName ?? version.command} copy`
      })
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.project) {
      throw new Error(body?.error ?? 'Could not duplicate version.')
    }

    const project = body.project as BrokCodeProject
    await Promise.all(
      files.map(file =>
        fetch(`/api/brokcode/projects/${project.id}/files`, {
          method: 'PUT',
          headers: {
            ...getAuthHeaders(apiKey),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(file)
        }).then(async saveResponse => {
          if (saveResponse.ok) return
          const saveBody = await saveResponse.json().catch(() => null)
          throw new Error(saveBody?.error ?? `Could not copy ${file.path}`)
        })
      )
    )

    setProjects(current => [project, ...current])
    setActiveProjectId(project.id)
    await refreshProjectFiles(project)
    await createProjectRuntimeRecord({
      project,
      status: 'healthy',
      versionId: version.id
    })
    toast.success('Version duplicated into a new project.')
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

    if (apiKey && isValidBrokApiKey(apiKey)) {
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
      setRuntimeError('Sign in before publishing from BrokCode Cloud.')
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
        body?.deploymentPreviewUrl ??
        body?.deployment?.previewUrl ??
        body?.deployment?.deploymentPreviewUrl ??
        body?.deployment?.deploymentUrl ??
        body?.deployment?.url ??
        body?.previewUrl
      const loadedPreviewUrl = loadPreviewUrlIfAllowed(previewCandidate)
      const message = loadedPreviewUrl
        ? strategy === 'managed_live_preview'
          ? 'App is published on its managed URL.'
          : 'Deployment preview is live.'
        : typeof body?.message === 'string'
          ? body.message
          : 'Deployment started.'
      if (body?.readiness) {
        setDeployReadiness(current => ({
          readiness: body.readiness as BrokCodeManagedDeployReadiness,
          latestDeployment:
            body.persistedDeployment &&
            typeof body.persistedDeployment === 'object'
              ? (body.persistedDeployment as BrokCodeDeployReadinessDeployment)
              : (current?.latestDeployment ?? null),
          deployments: body.persistedDeployment
            ? [
                body.persistedDeployment as BrokCodeDeployReadinessDeployment,
                ...(current?.deployments ?? []).filter(
                  deployment => deployment.id !== body.persistedDeployment.id
                )
              ].slice(0, 10)
            : (current?.deployments ?? []),
          previewUrl:
            typeof body.previewUrl === 'string'
              ? body.previewUrl
              : (current?.previewUrl ?? null),
          deploymentUrl:
            typeof body.deploymentUrl === 'string'
              ? body.deploymentUrl
              : (current?.deploymentUrl ?? null)
        }))
      }
      if (body?.project && typeof body.project === 'object') {
        const project = body.project as BrokCodeProject
        if (project.id) {
          setProjects(current => [
            project,
            ...current.filter(item => item.id !== project.id)
          ])
          setActiveProjectId(project.id)
        }
      }

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
        command: 'Publish managed app',
        summary: `${message} Strategy: ${strategy}`,
        runtime: activeRuntime === 'not_connected' ? 'brok' : activeRuntime,
        status: 'done',
        previewUrl: loadedPreviewUrl,
        prUrl: null
      })
      if (activeProject?.id) {
        void refreshProjects(apiKey)
        void refreshDeployReadiness(activeProject)
      }
      toast.success(
        loadedPreviewUrl
          ? 'Publish triggered and preview loaded'
          : 'Publish triggered'
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
    const exportPath = githubExportPath.trim() || activeProject?.slug || ''

    if (!repository) {
      setRuntimeError('Set repository before opening a PR.')
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
      `Head: ${head || 'auto-generated BrokCode branch'}`,
      `Base: ${base}`,
      `Path: ${exportPath || '/'}`,
      activeProject?.id ? `Project: ${activeProject.id}` : null,
      versions[0]?.id ? `Version: ${versions[0].id}` : null,
      latestRun?.previewUrl ? `Preview: ${latestRun.previewUrl}` : null,
      activeProject?.deploymentUrl
        ? `Deployment: ${activeProject.deploymentUrl}`
        : null,
      latestRun?.note ? '' : null,
      latestRun?.note || null
    ].filter((line): line is string => Boolean(line))

    const approved = window.confirm(
      [
        'Open a GitHub PR with the current BrokCode project files?',
        '',
        `Repository: ${repository}`,
        `Base branch: ${base}`,
        `Head branch: ${head || 'Auto-generated by BrokCode'}`,
        `Export path: ${exportPath || '/'}`,
        activeProject?.id ? `Project: ${activeProject.id}` : null,
        versions[0]?.id ? `Version: ${versions[0].id}` : null,
        '',
        'BrokCode will write project files to that branch before opening the PR.'
      ]
        .filter((line): line is string => Boolean(line))
        .join('\n')
    )
    if (!approved) return

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
          project_id: activeProject?.id ?? undefined,
          version_id: versions[0]?.id ?? undefined,
          export_path: exportPath || undefined,
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
      const filesCommitted = payload?.pullRequest?.export?.filesCommitted
      const message = prUrl
        ? `Opened PR #${prNumber ?? 'new'}: ${prUrl}${
            typeof filesCommitted === 'number'
              ? `\n\nCommitted ${filesCommitted} project file${
                  filesCommitted === 1 ? '' : 's'
                } to the branch first.`
              : ''
          }`
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
    setCommandInput(`Continue with ${agent.name}: ${agent.nextStep}`)
  }

  async function runCommand(
    command: string,
    options?: { retryRequest?: BrokCodeRetryRequest }
  ) {
    const trimmed = command.trim()
    if (!trimmed || isRunning) return
    if (hasUnsavedFileChanges) {
      const proceed = window.confirm(
        'You have unsaved file edits. Run BrokCode without saving them?'
      )
      if (!proceed) return
    }

    const retryRequest = options?.retryRequest
    const integrationToolkit = retryRequest
      ? null
      : detectIntegrationConnectIntent(trimmed)
    if (integrationToolkit) {
      setCommandInput('')
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

    const requestModel = retryRequest?.model ?? selectedModel
    const requestSource = retryRequest?.source ?? 'browser'
    const requestSessionId = retryRequest?.session_id ?? syncSessionId
    const requestProjectId = retryRequest?.project_id
    const requestBackendProvider =
      retryRequest?.backend_provider ?? activeBackend.provider
    const requestBackendStatus =
      retryRequest?.backend_status ?? activeBackend.status
    const requestBackendProjectUrl =
      retryRequest && 'backend_project_url' in retryRequest
        ? (retryRequest.backend_project_url ?? null)
        : activeBackend.provider === 'insforge'
          ? activeBackend.projectUrl
          : null
    const requestPreferPi = retryRequest?.prefer_pi ?? true
    const requestRequirePi = retryRequest?.require_pi ?? false
    const requestRequireOpenCode = retryRequest?.require_opencode ?? false
    const requestAllowBrokFallback = retryRequest?.allow_brok_fallback ?? true

    const run = createExecutionRun(trimmed)
    const assistantMessageId = createId('assistant')
    setExecutionRuns(current => [run, ...current].slice(0, 8))
    setCommandInput('')
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
        model: requestModel,
        projectId: requestProjectId ?? activeProject?.id ?? null,
        backendProvider: requestBackendProvider,
        backendStatus: requestBackendStatus,
        backendUrl: requestBackendProjectUrl
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

    let runTimeout: number | null = null

    try {
      const runProject = await ensureProjectForRun(trimmed, requestProjectId)
      const beforeRunFiles = await fetchProjectFilesForDiff(runProject)
      let runRuntime = await createProjectRuntimeRecord({
        project: runProject,
        status: 'preparing'
      })

      updateExecutionStep(run.id, 'plan', 'done', 'Project is ready.')
      updateExecutionStep(
        run.id,
        'execute',
        'running',
        'Building the requested changes.'
      )

      const controller = new AbortController()
      runTimeout = window.setTimeout(() => {
        controller.abort()
      }, BROKCODE_BROWSER_RUN_TIMEOUT_MS)

      const response = await fetch('/api/brokcode/execute', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          ...(apiKey && isValidBrokApiKey(apiKey)
            ? { Authorization: `Bearer ${apiKey}` }
            : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          command: trimmed,
          model: requestModel,
          source: requestSource,
          session_id: requestSessionId,
          stream: true,
          prefer_pi: requestPreferPi,
          require_pi: requestRequirePi,
          require_opencode: requestRequireOpenCode,
          allow_brok_fallback: requestAllowBrokFallback,
          retry_of_task_id: retryRequest?.retry_of_task_id,
          project_id: requestProjectId ?? runProject.id,
          backend_provider: requestBackendProvider,
          backend_status: requestBackendStatus,
          backend_project_url: requestBackendProjectUrl,
          messages: [
            {
              role: 'system',
              content: `${buildCommandPrompt(trimmed)}\n\nProject context: ${runProject.name} (${requestProjectId ?? runProject.id}).\nBackend context: ${requestBackendProvider === 'insforge' ? `InsForge ${requestBackendStatus}; project URL ${requestBackendProjectUrl ?? 'not set'}; database/auth/storage/functions are available when configured. Never ask the browser for the InsForge admin key.` : 'No backend provider configured yet.'}`
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
            if (event.type === 'task') {
              setExecutionRuns(current =>
                current.map(existing =>
                  existing.id === run.id
                    ? {
                        ...existing,
                        taskId: event.taskId,
                        statusUrl: event.statusUrl,
                        eventsUrl: event.eventsUrl,
                        note: 'Run is tracked in the background task ledger.'
                      }
                    : existing
                )
              )
              return
            }

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
                      content: formatBuilderContentForChat({
                        content: cleanAssistantContentForBuilder(
                          event.accumulated
                        )
                      })
                    }
                  : message
              )
            )
          })
        : await response.json()

      if (runTimeout) {
        window.clearTimeout(runTimeout)
        runTimeout = null
      }

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
      const serverFileChanges = normalizeBrokCodeFileChanges(body?.file_changes)
      const serverGeneratedFilePaths = normalizeBrokCodeGeneratedFilePaths(
        body?.generated_files
      )
      const generatedFiles = extractGeneratedPreviewFiles(assistantContent)

      let managedPreviewUrl: string | null = null
      let afterRunFiles = beforeRunFiles
      const serverPersistedRunOutput =
        shouldRefreshBrokCodeProjectAfterServerRun({
          generatedFilesCount: generatedFiles.length,
          serverFileChangesCount: serverFileChanges.length,
          serverGeneratedFilePathsCount: serverGeneratedFilePaths.length
        })

      if (serverPersistedRunOutput) {
        updateExecutionStep(
          run.id,
          'validate',
          'running',
          `Loading ${serverGeneratedFilePaths.length || serverFileChanges.length} server-saved file change${
            (serverGeneratedFilePaths.length || serverFileChanges.length) === 1
              ? ''
              : 's'
          }.`
        )
        afterRunFiles = await refreshProjectFiles(runProject)
        runRuntime = await createProjectRuntimeRecord({
          project: runProject,
          status: 'building',
          versionId:
            typeof body?.task_id === 'string'
              ? body.task_id
              : (run.taskId ?? null)
        })
        managedPreviewUrl = await openCloudProjectPreview(runProject.id).catch(
          error => {
            console.error('Could not refresh server-persisted preview:', error)
            return externalPreviewUrl
          }
        )
      } else if (generatedFiles.length > 0) {
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
        afterRunFiles = await refreshProjectFiles(runProject)
        runRuntime = await createProjectRuntimeRecord({
          project: runProject,
          status: 'building'
        })
        managedPreviewUrl = await openCloudProjectPreview(runProject.id)
      } else if (!externalPreviewUrl) {
        runRuntime = await refreshProjectRuntime(runProject)
        afterRunFiles = await fetchProjectFilesForDiff(runProject)
        managedPreviewUrl = await openCloudProjectPreview(runProject.id)
      }

      const discoveredPreviewUrl = managedPreviewUrl ?? externalPreviewUrl
      const runDiff = buildBrokCodeRunDiff({
        id: createId('diff'),
        command: trimmed,
        beforeFiles: beforeRunFiles,
        afterFiles: afterRunFiles,
        jobId:
          typeof body?.task_id === 'string'
            ? body.task_id
            : (run.taskId ?? null),
        previewUrl: discoveredPreviewUrl ?? null,
        runtimeChanges: [
          `${getRuntimeLabel(runtime)} completed`,
          ...serverFileChanges.slice(0, 6).map(change => change.summary)
        ],
        deployChanges: discoveredPreviewUrl
          ? [`Preview updated: ${discoveredPreviewUrl}`]
          : []
      })
      recordRunDiff(runDiff)
      if (runRuntime?.id) {
        const status = discoveredPreviewUrl ? 'healthy' : 'stopped'
        const response = await fetch(
          `/api/brokcode/projects/${encodeURIComponent(runProject.id)}/runtime`,
          {
            method: 'PATCH',
            headers: {
              ...getAuthHeaders(apiKey),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              runtimeId: runRuntime.id,
              status,
              health: {
                ok: Boolean(discoveredPreviewUrl),
                checkedAt: new Date().toISOString(),
                url: discoveredPreviewUrl,
                message: discoveredPreviewUrl
                  ? 'Preview URL is ready.'
                  : 'Run completed without a live preview URL.'
              }
            })
          }
        )
        const runtimeBody = await response.json().catch(() => null)
        if (response.ok && runtimeBody?.runtime) {
          setProjectRuntime(runtimeBody.runtime as BrokCodeRuntimeSandbox)
        }
      }

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
        previewUrl: discoveredPreviewUrl,
        taskId: body?.task_id ?? null,
        statusUrl: body?.status_url ?? null,
        eventsUrl: body?.events_url ?? null
      })

      if (discoveredPreviewUrl) {
        loadPreviewUrlIfAllowed(discoveredPreviewUrl)
      }

      setMessages(current =>
        current.map(message =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: formatBuilderContentForChat({
                  content: assistantContent,
                  files: generatedFiles,
                  previewUrl: discoveredPreviewUrl
                }),
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
          model: requestModel,
          projectId: runProject.id,
          backendProvider: requestBackendProvider,
          backendStatus: requestBackendStatus,
          backendUrl: requestBackendProjectUrl
        }
      })
      const savedVersion = await persistVersionSnapshot({
        command: trimmed,
        checkpointName: trimmed,
        projectId: runProject.id,
        summary: assistantContent,
        runtime,
        status: 'done',
        previewUrl: discoveredPreviewUrl ?? null,
        deploymentUrl: runProject.deploymentUrl ?? null,
        diff: runDiff,
        files: afterRunFiles.map(file => ({
          path: file.path,
          content: file.content,
          language: file.language
        }))
      })
      if (savedVersion) {
        attachVersionToRunDiff(runDiff.id, savedVersion.id)
      }
      if (apiKey) {
        await refreshUsage(apiKey)
        await refreshProjects(apiKey)
      }
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'The build is taking longer than expected. Try a smaller change, or rerun after the current runtime catches up.'
          : error instanceof Error
            ? error.message
            : 'Live Brok request failed.'
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
          model: requestModel,
          projectId: requestProjectId ?? activeProject?.id ?? null,
          backendProvider: requestBackendProvider,
          backendStatus: requestBackendStatus,
          backendUrl: requestBackendProjectUrl
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
      if (runTimeout) {
        window.clearTimeout(runTimeout)
      }
      setIsRunning(false)
    }
  }

  function fixRuntimeFailure() {
    const logs = runtimeDiagnostics?.logs.slice(-14) ?? []
    const lastError = runtimeDiagnostics?.lastError
    const errorLocation = lastError
      ? [
          lastError.file,
          typeof lastError.line === 'number' ? lastError.line : null,
          typeof lastError.column === 'number' ? lastError.column : null
        ]
          .filter(
            value => value !== null && value !== undefined && value !== ''
          )
          .join(':')
      : ''
    const prompt = [
      'Fix the current BrokCode preview/runtime failure and keep the app functional.',
      activeProject
        ? `Project: ${activeProject.name} (${activeProject.id}). Use the current project files as the source of truth.`
        : 'Use the current project files as the source of truth.',
      projectRuntime
        ? `Runtime: ${projectRuntime.status}; app type ${projectRuntime.appType}; dev command ${projectRuntime.devCommand}; workspace ${projectRuntime.workspacePath}.`
        : 'Runtime: unavailable.',
      lastError
        ? `Last error: ${lastError.message}${errorLocation ? ` at ${errorLocation}` : ''}.`
        : 'Last error: none captured yet; inspect the recent logs.',
      logs.length > 0
        ? `Recent runtime logs:\n${logs
            .map(log => {
              const location =
                log.file || typeof log.line === 'number'
                  ? ` (${[
                      log.file,
                      typeof log.line === 'number' ? log.line : null,
                      typeof log.column === 'number' ? log.column : null
                    ]
                      .filter(
                        value =>
                          value !== null && value !== undefined && value !== ''
                      )
                      .join(':')})`
                  : ''
              return `- [${log.source}/${log.level}]${location} ${log.message}`
            })
            .join('\n')}`
        : 'Recent runtime logs: none captured yet.',
      'After fixing, regenerate the preview and verify the error is gone.'
    ].join('\n\n')

    setCommandInput(prompt)
    setMobilePane('chat')
    void runCommandRef.current?.(prompt)
  }

  runCommandRef.current = runCommand

  useEffect(() => {
    if (!runtimeBootstrapped) return
    if (cloudBootstrapRef.current) return

    const prompt = initialPrompt.trim()
    if (!prompt) return

    cloudBootstrapRef.current = true
    setCommandInput(prompt)

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
    runtimeBootstrapped,
    setCommandInput
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
    <div
      className="brokcode-lovable flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f6f6f3] text-zinc-950"
      data-testid="brokcode-app"
    >
      <datalist id="brokcode-github-repositories">
        {githubRepositories.map(repository => (
          <option
            key={repository.fullName}
            value={repository.fullName}
            label={`${repository.fullName} (${repository.defaultBranch ?? 'main'})`}
          />
        ))}
      </datalist>
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

          <div className="hidden min-w-0 items-center gap-2 text-xs text-zinc-500 xl:flex">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  hasLiveRuntime ? 'bg-emerald-500' : 'bg-zinc-300'
                )}
              />
              {hasAccountRuntime ? 'Browser session' : 'Sign in required'}
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
                  data-testid="brokcode-actions-trigger"
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
                  {isDeploying ? 'Publishing...' : '1-click deploy'}
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
                  Browser session active
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

      <nav
        className="border-b border-zinc-200/80 bg-white/95 px-3 py-2 lg:hidden"
        aria-label="Brok Code mobile workspace"
      >
        <div className="grid grid-cols-3 rounded-full border border-zinc-200 bg-zinc-50 p-1 shadow-sm">
          {[
            {
              id: 'chat' as const,
              label: 'Chat',
              icon: Bot,
              badge: isRunning ? 'live' : null
            },
            {
              id: 'preview' as const,
              label: 'Preview',
              icon: Monitor,
              badge: previewUrl.trim() ? 'app' : null
            },
            {
              id: 'ship' as const,
              label: 'Ship',
              icon: Rocket,
              badge: activeBackend.provider === 'insforge' ? 'db' : null
            }
          ].map(item => {
            const Icon = item.icon
            const active = mobilePane === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'flex h-11 min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors',
                  active
                    ? 'bg-zinc-950 text-white shadow-sm'
                    : 'text-zinc-600 hover:bg-white hover:text-zinc-950'
                )}
                onClick={() => setMobilePane(item.id)}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                      active
                        ? 'bg-white/15 text-white/80'
                        : 'bg-white text-zinc-500'
                    )}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f6f6f3] lg:grid lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)] xl:grid-cols-[minmax(380px,460px)_minmax(0,1fr)]">
        <section
          className={cn(
            'min-h-0 flex-col overflow-hidden border-b border-zinc-200/80 bg-white lg:flex lg:border-b-0 lg:border-r',
            mobilePane === 'chat' ? 'flex flex-1' : 'hidden'
          )}
        >
          <div className="border-b border-zinc-200/80 bg-white px-3 py-2 sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-950">
                  Builder chat
                </p>
                <p className="hidden truncate text-xs text-zinc-500 sm:block">
                  Tell Brok what to build. The preview updates on the right.
                </p>
              </div>
              <Badge
                variant={isRunning ? 'default' : 'secondary'}
                className="shrink-0 rounded-full border-zinc-200 bg-zinc-50 px-2.5 text-zinc-700"
              >
                {isRunning ? 'Working' : 'Ready'}
              </Badge>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:gap-5">
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
                  onRename={version => {
                    void renameVersionCheckpoint(version)
                  }}
                  onRestore={version => {
                    void restoreVersionSnapshot(version)
                  }}
                  onDuplicate={version => {
                    void duplicateVersionSnapshot(version)
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

              {(isRunning || executionRuns.length > 0) && (
                <AgentReasoningBar
                  run={executionRuns[0]}
                  fallbackHint={runStreamingHints[runHintIndex]}
                  reconnectingTaskId={reconnectingTaskId}
                  cancellingTaskId={cancellingTaskId}
                  onReconnect={run => {
                    void reconnectExecutionRun(run)
                  }}
                  onCancel={run => {
                    void cancelExecutionRun(run)
                  }}
                  onRetry={run => {
                    void retryExecutionRun(run)
                  }}
                />
              )}
            </div>
          </div>

          <div className="border-t border-zinc-200/80 bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:p-4">
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {builderQuickPrompts.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  className="shrink-0 h-11 min-h-11 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950"
                  onClick={() => setCommandInput(prompt)}
                  onMouseDown={event => {
                    if (event.button === 0) {
                      setCommandInput(prompt)
                    }
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setCommandInput(prompt)
                    }
                  }}
                  onPointerDown={() => setCommandInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="w-full">
              <form
                className="relative flex items-end gap-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_48px_-34px_rgba(24,24,27,0.5)]"
                onSubmit={event => {
                  event.preventDefault()
                  runCommand(input)
                }}
              >
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
                <Textarea
                  value={input}
                  data-testid="brokcode-command-input"
                  ref={commandInputRef}
                  onChange={event => setCommandInput(event.target.value)}
                  onInput={event =>
                    setCommandInput((event.target as HTMLTextAreaElement).value)
                  }
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      runCommand(input)
                    }
                  }}
                  placeholder="Ask Brok Code to build, fix, audit, or ship..."
                  className="max-h-32 min-h-11 resize-none border-0 bg-transparent text-sm leading-6 text-zinc-950 placeholder:text-zinc-400 focus-visible:ring-0 focus-visible:ring-offset-0 sm:max-h-36 sm:min-h-12"
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
                  className="mb-1 size-9 shrink-0 rounded-xl bg-zinc-950 text-white hover:bg-zinc-800"
                  data-testid="brokcode-command-submit"
                  disabled={isRunning || !input.trim()}
                >
                  <Send className="size-4" />
                  <span className="sr-only">Send</span>
                </Button>
              </form>
            </div>
          </div>
        </section>

        <section
          className={cn(
            'min-h-0 flex-1 overflow-y-auto bg-[#f6f6f3] p-3 lg:hidden',
            mobilePane === 'ship' ? 'block' : 'hidden'
          )}
        >
          <div className="space-y-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-950">
                    Ship center
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {activeProject?.name ?? 'Create a project from chat first'}
                  </p>
                </div>
                <Badge
                  variant={hasLiveRuntime ? 'default' : 'outline'}
                  className="shrink-0 rounded-full"
                >
                  {hasLiveRuntime ? 'Cloud ready' : 'Sign in'}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  className="h-10 gap-2 rounded-xl"
                  disabled={!hasLiveRuntime || isDeploying}
                  onClick={() => {
                    void deployBrokCodeCloud()
                  }}
                >
                  {isDeploying ? (
                    <RefreshCcw className="size-4 animate-spin" />
                  ) : (
                    <Rocket className="size-4" />
                  )}
                  Publish
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 gap-2 rounded-xl"
                >
                  <Link href="/brokcode/tui">
                    <TerminalSquare className="size-4" />
                    TUI
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-10 gap-2 rounded-xl"
                  disabled={
                    isConnectingGithub ||
                    Boolean(isConnectingIntegration) ||
                    githubStatus === 'connected'
                  }
                  onClick={() => handleChatAction('connect-github')}
                >
                  <Github className="size-4" />
                  {githubStatus === 'connected' ? 'GitHub on' : 'GitHub'}
                </Button>
                <Button
                  variant="outline"
                  className="h-10 gap-2 rounded-xl"
                  onClick={() => handleChatAction('run-checks')}
                >
                  <CheckCircle2 className="size-4" />
                  Checks
                </Button>
              </div>

              <div className="mt-3">
                <DeployReadinessPanel
                  compact
                  state={deployReadiness}
                  loading={deployReadinessLoading}
                  error={deployReadinessError}
                  hasProject={Boolean(activeProject)}
                  onRefresh={() => {
                    void refreshDeployReadiness()
                  }}
                  onOpenPreview={url => loadPreviewUrlIfAllowed(url)}
                />
              </div>

              <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-zinc-500">GitHub export</Label>
                  <Badge variant="outline" className="rounded-full">
                    {githubStatus === 'connected' ? 'Connected' : 'Off'}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Input
                    value={githubRepository}
                    onChange={event =>
                      selectGithubRepository(event.target.value)
                    }
                    list="brokcode-github-repositories"
                    placeholder="owner/repo"
                    className="h-9 rounded-xl border-zinc-200 bg-zinc-50 text-xs"
                    aria-label="GitHub repository"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={githubBaseBranch}
                      onChange={event =>
                        setGithubBaseBranch(event.target.value)
                      }
                      placeholder="base"
                      className="h-9 rounded-xl border-zinc-200 bg-zinc-50 text-xs"
                      aria-label="GitHub base branch"
                    />
                    <Input
                      value={githubHeadBranch}
                      onChange={event =>
                        setGithubHeadBranch(event.target.value)
                      }
                      placeholder="auto branch"
                      className="h-9 rounded-xl border-zinc-200 bg-zinc-50 text-xs"
                      aria-label="GitHub head branch"
                    />
                  </div>
                  <Input
                    value={githubExportPath}
                    onChange={event => setGithubExportPath(event.target.value)}
                    placeholder={activeProject?.slug ?? 'export path'}
                    className="h-9 rounded-xl border-zinc-200 bg-zinc-50 text-xs"
                    aria-label="GitHub export path"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl"
                      disabled={githubRepositoriesLoading}
                      onClick={() => {
                        void refreshGithubRepositories(apiKey)
                      }}
                    >
                      {githubRepositoriesLoading ? (
                        <RefreshCcw className="size-4 animate-spin" />
                      ) : (
                        <Github className="size-4" />
                      )}
                      Repos
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl"
                      disabled={!hasLiveRuntime || isSubmittingPr}
                      onClick={() => {
                        void submitPullRequest()
                      }}
                    >
                      <Rocket className="size-4" />
                      PR
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl"
                      onClick={() => {
                        void refreshRepoContext(apiKey)
                      }}
                    >
                      <RefreshCcw className="size-4" />
                      Detect
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-950">
                    Model and backend
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {activeBackend.provider === 'insforge'
                      ? activeBackend.projectUrl || activeBackend.status
                      : 'Add the shared cloud backend when the app needs data.'}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 rounded-full border-zinc-200 bg-zinc-50"
                >
                  {activeBackend.provider === 'insforge'
                    ? activeBackend.health === 'online'
                      ? 'Backend live'
                      : activeBackend.status
                    : 'No backend'}
                </Badge>
              </div>

              <Label className="text-xs text-zinc-500">Builder model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="mt-1 h-10 rounded-xl border-zinc-200 bg-zinc-50">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  {codeModels.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="mt-3 flex gap-2">
                {activeBackend.provider === 'insforge' ? (
                  <Button
                    variant="outline"
                    className="h-9 flex-1 rounded-xl"
                    disabled={backendChecking}
                    onClick={() => {
                      void checkBackendHealth()
                    }}
                  >
                    {backendChecking ? (
                      <RefreshCcw className="size-4 animate-spin" />
                    ) : (
                      <Radar className="size-4" />
                    )}
                    Check backend
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="h-9 flex-1 rounded-xl"
                    disabled={backendProvisioning || !hasLiveRuntime}
                    onClick={() => {
                      void provisionInsForgeBackend()
                    }}
                  >
                    {backendProvisioning ? (
                      <RefreshCcw className="size-4 animate-spin" />
                    ) : (
                      <PlugZap className="size-4" />
                    )}
                    Add backend
                  </Button>
                )}
                {previewUrl.trim() ? (
                  <Button
                    variant="outline"
                    className="h-9 rounded-xl px-3"
                    onClick={() => setMobilePane('preview')}
                  >
                    <Eye className="size-4" />
                    View
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-950">
                  Agent activity
                </p>
                <Badge variant="outline" className="rounded-full">
                  {executionRuns.length || 0}
                </Badge>
              </div>
              <ExecutionVisualizer runs={executionRuns} />
            </div>

            <SyncedSessionPanel
              session={activeSyncSession}
              sessionId={syncSessionId}
              loading={syncLoading}
              onRefresh={() => {
                void refreshSyncedSessions()
              }}
            />

            <VersionHistoryPanel
              versions={versions}
              loading={versionsLoading}
              onRefresh={() => {
                if (apiKey) {
                  void refreshVersions(apiKey)
                }
              }}
              onRename={version => {
                void renameVersionCheckpoint(version)
              }}
              onRestore={version => {
                void restoreVersionSnapshot(version)
              }}
              onDuplicate={version => {
                void duplicateVersionSnapshot(version)
              }}
            />
          </div>
        </section>

        <aside
          className={cn(
            'min-h-0 flex-col overflow-hidden bg-[#f3f2ee] lg:flex',
            mobilePane === 'preview' ? 'flex flex-1' : 'hidden'
          )}
        >
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
              <div className="mt-2 grid grid-cols-1 gap-2 border-t border-zinc-100 pt-2 xl:grid-cols-[1.4fr_0.8fr_0.9fr_1fr_auto]">
                <Input
                  value={githubRepository}
                  onChange={event => selectGithubRepository(event.target.value)}
                  list="brokcode-github-repositories"
                  placeholder="owner/repo"
                  className="h-8 rounded-full border-zinc-200 bg-zinc-50 px-3 text-xs"
                  aria-label="GitHub repository"
                />
                <Input
                  value={githubBaseBranch}
                  onChange={event => setGithubBaseBranch(event.target.value)}
                  placeholder="base"
                  className="h-8 rounded-full border-zinc-200 bg-zinc-50 px-3 text-xs"
                  aria-label="GitHub base branch"
                />
                <Input
                  value={githubHeadBranch}
                  onChange={event => setGithubHeadBranch(event.target.value)}
                  placeholder="auto branch"
                  className="h-8 rounded-full border-zinc-200 bg-zinc-50 px-3 text-xs"
                  aria-label="GitHub head branch"
                />
                <Input
                  value={githubExportPath}
                  onChange={event => setGithubExportPath(event.target.value)}
                  placeholder={activeProject?.slug ?? 'export path'}
                  className="h-8 rounded-full border-zinc-200 bg-zinc-50 px-3 text-xs"
                  aria-label="GitHub export path"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    disabled={githubRepositoriesLoading}
                    onClick={() => {
                      void refreshGithubRepositories(apiKey)
                    }}
                  >
                    {githubRepositoriesLoading ? (
                      <RefreshCcw className="size-3.5 animate-spin" />
                    ) : (
                      <Github className="size-3.5" />
                    )}
                    Repos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    onClick={() => {
                      void refreshRepoContext(apiKey)
                    }}
                  >
                    <RefreshCcw className="size-3.5" />
                    Detect
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    disabled={
                      !hasLiveRuntime ||
                      isSubmittingPr ||
                      githubStatus !== 'connected'
                    }
                    onClick={() => {
                      void submitPullRequest()
                    }}
                  >
                    <Rocket className="size-3.5" />
                    PR
                  </Button>
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
            <Tabs defaultValue="brain" className="mb-2">
              <TabsList className="grid h-auto grid-cols-3 rounded-lg border border-zinc-200 bg-white p-1 text-xs shadow-sm xl:grid-cols-6">
                <TabsTrigger value="brain" className="rounded-md text-xs">
                  Brain
                </TabsTrigger>
                <TabsTrigger value="files" className="rounded-md text-xs">
                  Files
                </TabsTrigger>
                <TabsTrigger value="backend" className="rounded-md text-xs">
                  Backend
                </TabsTrigger>
                <TabsTrigger value="diff" className="rounded-md text-xs">
                  Diff
                </TabsTrigger>
                <TabsTrigger value="logs" className="rounded-md text-xs">
                  Logs
                </TabsTrigger>
                <TabsTrigger value="versions" className="rounded-md text-xs">
                  Versions
                </TabsTrigger>
              </TabsList>
              <TabsContent value="brain" className="mt-2">
                <ProjectBrainPanel
                  brain={projectBrain}
                  hasProject={Boolean(activeProject)}
                  onSuggestedAction={action => {
                    setCommandInput(action)
                    setMobilePane('chat')
                  }}
                />
              </TabsContent>
              <TabsContent value="files" className="mt-2">
                <ProjectFilesPanel
                  files={projectFiles}
                  loading={projectFilesLoading}
                  error={projectFilesError}
                  selectedFile={selectedProjectFile}
                  draft={fileDraft}
                  editMode={fileEditMode}
                  saving={fileSaving}
                  hasUnsavedChanges={hasUnsavedFileChanges}
                  onSelectFile={selectProjectFile}
                  onDraftChange={setFileDraft}
                  onEditModeChange={setFileEditMode}
                  onSave={() => {
                    void saveProjectFile()
                  }}
                  onRefresh={() => {
                    void refreshProjectFiles()
                  }}
                />
              </TabsContent>
              <TabsContent value="backend" className="mt-2">
                <ProjectBackendPanel
                  backend={activeBackend}
                  backendChecking={backendChecking}
                  backendProvisioning={backendProvisioning}
                  hasLiveRuntime={hasLiveRuntime}
                  onCheck={() => {
                    void checkBackendHealth()
                  }}
                  onProvision={() => {
                    void provisionInsForgeBackend()
                  }}
                />
              </TabsContent>
              <TabsContent value="diff" className="mt-2">
                <RunDiffPanel
                  diffs={runDiffs}
                  selectedDiff={selectedRunDiff}
                  selectedFile={selectedDiffFile}
                  onSelectDiff={diff => {
                    setSelectedRunDiffId(diff.id)
                    setSelectedDiffFilePath(diff.files[0]?.path ?? '')
                  }}
                  onSelectFile={file => setSelectedDiffFilePath(file.path)}
                  onOpenFile={openDiffFileInEditor}
                />
              </TabsContent>
              <TabsContent value="logs" className="mt-2">
                <RuntimeLogsPanel
                  runtimeDiagnostics={runtimeDiagnostics}
                  latestRun={executionRuns[0]}
                  runtimeError={runtimeError}
                  onFixRuntimeError={fixRuntimeFailure}
                />
              </TabsContent>
              <TabsContent value="versions" className="mt-2">
                <VersionHistoryPanel
                  versions={versions}
                  loading={versionsLoading}
                  compact
                  onRefresh={() => {
                    void refreshVersions(apiKey)
                  }}
                  onRename={version => {
                    void renameVersionCheckpoint(version)
                  }}
                  onRestore={version => {
                    void restoreVersionSnapshot(version)
                  }}
                  onDuplicate={version => {
                    void duplicateVersionSnapshot(version)
                  }}
                />
              </TabsContent>
            </Tabs>
            <BrowserPreviewPanel
              isRunning={isRunning}
              previewInput={previewInput}
              previewUrl={previewUrl}
              previewFrameKey={previewFrameKey}
              previewHealth={previewHealth}
              onDirectLoad={loadPreviewTarget}
              onReload={reloadPreview}
              runtimeError={runtimeError}
              runtimeLoading={projectRuntimeLoading}
              runtimeSandbox={projectRuntime}
              runtimeDiagnostics={runtimeDiagnostics}
              onFixRuntimeError={fixRuntimeFailure}
              latestRun={executionRuns[0]}
            />
          </div>
        </aside>
      </main>
    </div>
  )
}

function DeployReadinessPanel({
  compact = false,
  error,
  hasProject,
  loading,
  onOpenPreview,
  onRefresh,
  state
}: {
  compact?: boolean
  error: string | null
  hasProject: boolean
  loading: boolean
  onOpenPreview: (url: string) => void
  onRefresh: () => void
  state: BrokCodeDeployReadinessState | null
}) {
  const summary = summarizeBrokCodeDeployReadiness({
    error,
    hasProject,
    latestDeployment: state?.latestDeployment,
    loading,
    readiness: state?.readiness
  })
  const readiness = state?.readiness ?? null
  const latestDeployment = state?.latestDeployment ?? null
  const deploymentUrl = latestDeployment?.url ?? state?.deploymentUrl ?? null
  const previewUrl = state?.previewUrl ?? readiness?.previewUrl
  const blockedIssues = readiness?.quality?.issues ?? []
  const missingFiles = readiness?.requiredFiles ?? []

  return (
    <div
      className={cn(
        'mb-2 rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-600 shadow-sm',
        compact && 'mb-0'
      )}
      data-testid="brokcode-deploy-readiness"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-zinc-950">Publish readiness</p>
            <Badge
              variant={summary.tone === 'ready' ? 'default' : 'outline'}
              className={cn(
                'rounded-full',
                summary.tone === 'blocked' &&
                  'border-amber-200 bg-amber-50 text-amber-800',
                summary.tone === 'checking' &&
                  'border-blue-200 bg-blue-50 text-blue-700'
              )}
            >
              {summary.label}
            </Badge>
            {readiness ? (
              <span className="text-[11px] text-zinc-500">
                {readiness.fileCount} files
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-zinc-500">{summary.detail}</p>
          {(missingFiles.length > 0 || blockedIssues.length > 0) && (
            <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">
              {[...missingFiles, ...blockedIssues].slice(0, 3).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {previewUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-2.5 text-xs"
              onClick={() => onOpenPreview(previewUrl)}
            >
              <Eye className="size-3.5" />
              Preview
            </Button>
          ) : null}
          {deploymentUrl ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-2.5 text-xs"
            >
              <a href={deploymentUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Published app
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            disabled={loading || !hasProject}
            onClick={onRefresh}
            title="Refresh deploy readiness"
          >
            <RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} />
            <span className="sr-only">Refresh deploy readiness</span>
          </Button>
        </div>
      </div>
      {state?.deployments.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
          <span>{state.deployments.length} deploys</span>
          {latestDeployment ? (
            <span>
              latest {latestDeployment.status}
              {latestDeployment.updatedAt
                ? ` · ${new Date(latestDeployment.updatedAt).toLocaleTimeString()}`
                : ''}
            </span>
          ) : null}
        </div>
      ) : null}
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
  compact = false,
  onRefresh,
  onRename,
  onRestore,
  onDuplicate
}: {
  versions: BrokCodeVersion[]
  loading: boolean
  compact?: boolean
  onRefresh: () => void
  onRename: (version: BrokCodeVersion) => void
  onRestore: (version: BrokCodeVersion) => void
  onDuplicate: (version: BrokCodeVersion) => void
}) {
  return (
    <div
      className={cn(
        'rounded-md border bg-background p-3 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.45)]',
        compact && 'mb-2 max-h-[24vh] overflow-auto'
      )}
    >
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
                <p className="line-clamp-1 font-medium">
                  {version.checkpointName ?? version.command}
                </p>
                <Badge
                  variant={version.status === 'done' ? 'secondary' : 'outline'}
                  className="rounded-md text-[10px]"
                >
                  {version.status}
                </Badge>
              </div>
              {version.checkpointName && (
                <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                  {version.command}
                </p>
              )}
              <p className="mt-1 line-clamp-2 text-muted-foreground">
                {version.summary}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>{new Date(version.createdAt).toLocaleTimeString()}</span>
                {version.runtime && <span>· {version.runtime}</span>}
                {version.files?.length ? (
                  <span>· {version.files.length} files</span>
                ) : null}
                {version.deploymentUrl && <span>· live provenance</span>}
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
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-2 text-[11px]"
                  onClick={() => onRename(version)}
                >
                  Name
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-2 text-[11px]"
                  disabled={!version.files?.length}
                  onClick={() => onRestore(version)}
                >
                  Restore
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-2 text-[11px]"
                  disabled={!version.files?.length}
                  onClick={() => onDuplicate(version)}
                >
                  Duplicate
                </Button>
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
        <div className="hidden size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-950 text-white sm:flex">
          <Bot className="size-4" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[min(100%,42rem)] rounded-2xl border p-3 text-sm leading-6 shadow-[0_18px_46px_-38px_rgba(24,24,27,0.55)] sm:p-4',
          isUser && 'border-zinc-950 bg-zinc-950 text-white',
          isSystem &&
            'border-dashed border-zinc-200 bg-zinc-50 py-2 text-xs text-zinc-500 shadow-none',
          !isUser && !isSystem && 'border-zinc-200 bg-white text-zinc-950'
        )}
      >
        {!isUser && !isSystem && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-500">
            <span className="size-1.5 rounded-full bg-emerald-500" />
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
                  'rounded-md border border-zinc-200 bg-zinc-50 p-2 text-left transition-colors hover:bg-zinc-100',
                  selectedId === agent.id && 'border-zinc-950'
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
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
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
                className="w-full gap-2 border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 sm:w-auto"
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
                className="w-full gap-2 border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 sm:w-auto"
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
                className="w-full gap-2 border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 sm:w-auto"
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
                  className="w-full gap-2 border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 sm:w-auto"
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
        <div className="hidden size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 sm:flex">
          <User className="size-4" />
        </div>
      )}
    </article>
  )
}

function AgentReasoningBar({
  run,
  fallbackHint,
  reconnectingTaskId,
  cancellingTaskId,
  onReconnect,
  onCancel,
  onRetry
}: {
  run?: ExecutionRun
  fallbackHint: string
  reconnectingTaskId: string | null
  cancellingTaskId: string | null
  onReconnect: (run: ExecutionRun) => void
  onCancel: (run: ExecutionRun) => void
  onRetry: (run: ExecutionRun) => void
}) {
  const activeStep =
    run?.steps.find(step => step.status === 'running') ??
    [...(run?.steps ?? [])].reverse().find(step => step.status === 'done')
  const status = run?.status ?? 'running'
  const label =
    status === 'error'
      ? 'Needs attention'
      : status === 'done'
        ? 'Finished'
        : 'Working'
  const detail = activeStep?.detail ?? fallbackHint
  const completed =
    run?.steps.filter(
      step => step.status === 'done' || step.status === 'skipped'
    ).length ?? 0
  const total = Math.max(run?.steps.length ?? 5, 1)
  const progress =
    status === 'done'
      ? 100
      : status === 'error'
        ? Math.max(14, Math.round((completed / total) * 100))
        : Math.max(
            18,
            Math.round(
              ((completed + (activeStep?.status === 'running' ? 0.55 : 0)) /
                total) *
                100
            )
          )
  const isTaskBackedRun = Boolean(run?.taskId)
  const canReconnect = Boolean(run?.eventsUrl && isTaskBackedRun)
  const canCancel = Boolean(run?.taskId && status === 'running')
  const isReconnecting =
    Boolean(run?.taskId) && reconnectingTaskId === run?.taskId
  const isCancelling = Boolean(run?.taskId) && cancellingTaskId === run?.taskId

  return (
    <div className="mr-auto w-full max-w-[min(100%,42rem)] rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-zinc-950 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg text-white',
              status === 'error'
                ? 'bg-rose-500'
                : status === 'done'
                  ? 'bg-emerald-500'
                  : 'bg-zinc-950'
            )}
          >
            {status === 'done' ? (
              <CheckCircle2 className="size-4" />
            ) : status === 'error' ? (
              <Clock3 className="size-4" />
            ) : (
              <Wand2 className="size-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{label}</p>
            <p className="truncate text-xs text-zinc-500">{detail}</p>
          </div>
        </div>
        {status === 'running' && (
          <span className="typing-dots shrink-0" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        )}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-200">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            status === 'error'
              ? 'bg-rose-500'
              : status === 'done'
                ? 'bg-emerald-500'
                : 'bg-zinc-950'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      {run && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canReconnect && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-white/15 bg-white px-3 text-xs text-black hover:bg-white/90"
              disabled={isReconnecting || isCancelling}
              onClick={() => onReconnect(run)}
            >
              {isReconnecting ? (
                <RefreshCcw className="size-3.5 animate-spin" />
              ) : (
                <Radar className="size-3.5" />
              )}
              {isReconnecting ? 'Reconnecting' : 'Follow task'}
            </Button>
          )}
          {canCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-white/15 bg-transparent px-3 text-xs text-white hover:bg-white/10"
              disabled={isCancelling || isReconnecting}
              onClick={() => onCancel(run)}
            >
              {isCancelling ? (
                <RefreshCcw className="size-3.5 animate-spin" />
              ) : (
                <Clock3 className="size-3.5" />
              )}
              {isCancelling ? 'Cancelling' : 'Cancel'}
            </Button>
          )}
          {status !== 'running' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-none px-3 text-xs text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => onRetry(run)}
            >
              <Play className="size-3.5" />
              Retry
            </Button>
          )}
          {run.taskId && (
            <span className="truncate text-[11px] text-white/38">
              task {run.taskId.slice(0, 8)}
            </span>
          )}
        </div>
      )}
    </div>
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
                      if (step.status === 'done' || step.status === 'skipped') {
                        return total + 1
                      }
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
                              : step.status === 'skipped'
                                ? 'bg-zinc-300'
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

function languageLabel(file: BrokCodeProjectFile | null) {
  if (!file) return 'File'
  if (file.language) return file.language.toUpperCase()
  const ext = file.path.split('.').pop()
  return ext ? ext.toUpperCase() : 'TXT'
}

function isUnsupportedViewerFile(file: BrokCodeProjectFile | null) {
  if (!file) return false
  return /\.(png|jpe?g|gif|webp|ico|pdf|zip|woff2?)$/i.test(file.path)
}

type HighlightTone =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'punctuation'
  | 'property'
  | 'tag'
  | 'heading'

type HighlightSegment = {
  text: string
  tone: HighlightTone
}

const javascriptKeywords = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'else',
  'export',
  'extends',
  'false',
  'for',
  'from',
  'function',
  'if',
  'import',
  'interface',
  'let',
  'new',
  'null',
  'return',
  'switch',
  'throw',
  'true',
  'try',
  'type',
  'undefined',
  'var',
  'while'
])

function getFileLanguage(file: BrokCodeProjectFile | null) {
  const explicit = file?.language?.toLowerCase()
  if (explicit) return explicit
  const extension = file?.path.split('.').pop()?.toLowerCase()
  if (extension === 'tsx') return 'tsx'
  if (extension === 'ts') return 'typescript'
  if (extension === 'jsx') return 'jsx'
  if (extension === 'js') return 'javascript'
  if (extension === 'html') return 'html'
  if (extension === 'css') return 'css'
  if (extension === 'json') return 'json'
  if (extension === 'md' || extension === 'mdx') return 'markdown'
  return extension ?? 'text'
}

function segmentWithPattern(
  line: string,
  pattern: RegExp,
  classify: (token: string) => HighlightTone
): HighlightSegment[] {
  const segments: HighlightSegment[] = []
  let cursor = 0

  for (const match of line.matchAll(pattern)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index > cursor) {
      segments.push({ text: line.slice(cursor, index), tone: 'plain' })
    }
    segments.push({ text: token, tone: classify(token) })
    cursor = index + token.length
  }

  if (cursor < line.length) {
    segments.push({ text: line.slice(cursor), tone: 'plain' })
  }

  return segments.length > 0 ? segments : [{ text: line, tone: 'plain' }]
}

function segmentCodeLine(line: string, language: string): HighlightSegment[] {
  if (!line) return [{ text: ' ', tone: 'plain' }] satisfies HighlightSegment[]

  if (
    ['javascript', 'typescript', 'jsx', 'tsx', 'js', 'ts'].includes(language)
  ) {
    const commentStart = line.indexOf('//')
    if (commentStart >= 0) {
      return [
        ...segmentCodeLine(line.slice(0, commentStart), language),
        { text: line.slice(commentStart), tone: 'comment' as const }
      ]
    }

    return segmentWithPattern(
      line,
      /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b)/g,
      token => {
        if (/^['"`]/.test(token)) return 'string'
        if (/^\d/.test(token)) return 'number'
        if (javascriptKeywords.has(token)) return 'keyword'
        return 'plain'
      }
    )
  }

  if (language === 'html') {
    return segmentWithPattern(
      line,
      /(<!--.*?-->|<\/?[A-Za-z][^\s>/]*|\/?>|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
      token => {
        if (token.startsWith('<!--')) return 'comment'
        if (token.startsWith('<')) return 'tag'
        if (/^['"]/.test(token)) return 'string'
        return 'punctuation'
      }
    )
  }

  if (language === 'css') {
    return segmentWithPattern(
      line,
      /(\/\*.*?\*\/|#[\da-fA-F]{3,8}\b|[A-Za-z-]+(?=\s*:)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw)?\b)/g,
      token => {
        if (token.startsWith('/*')) return 'comment'
        if (/^['"]/.test(token) || token.startsWith('#')) return 'string'
        if (/^\d/.test(token)) return 'number'
        return 'property'
      }
    )
  }

  if (language === 'json') {
    return segmentWithPattern(
      line,
      /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\btrue\b|\bfalse\b|\bnull\b|-?\b\d+(?:\.\d+)?\b|[{}\[\]:,])/g,
      token => {
        if (
          /^".*"$/.test(token) &&
          /:\s*$/.test(line.slice(line.indexOf(token)))
        ) {
          return 'property'
        }
        if (/^"/.test(token)) return 'string'
        if (/^-?\d/.test(token)) return 'number'
        if (/^(true|false|null)$/.test(token)) return 'keyword'
        return 'punctuation'
      }
    )
  }

  if (language === 'markdown') {
    if (/^#{1,6}\s/.test(line)) return [{ text: line, tone: 'heading' }]
    return segmentWithPattern(line, /(`[^`]+`|\*\*[^*]+\*\*)/g, token => {
      if (token.startsWith('`')) return 'string'
      return 'keyword'
    })
  }

  return [{ text: line, tone: 'plain' }]
}

function highlightToneClass(tone: HighlightTone) {
  switch (tone) {
    case 'keyword':
      return 'text-sky-300'
    case 'string':
      return 'text-emerald-300'
    case 'number':
      return 'text-orange-300'
    case 'comment':
      return 'text-zinc-500'
    case 'punctuation':
      return 'text-zinc-300'
    case 'property':
      return 'text-violet-300'
    case 'tag':
      return 'text-cyan-300'
    case 'heading':
      return 'text-amber-200'
    default:
      return 'text-zinc-100'
  }
}

function HighlightedCode({ file }: { file: BrokCodeProjectFile }) {
  const language = getFileLanguage(file)
  const lines = file.content.split('\n')

  return (
    <pre className="min-h-44 overflow-auto p-3 font-mono text-[11px] leading-5">
      <code>
        {lines.map((line, index) => (
          <span
            key={`${file.path}-${index}`}
            className="grid grid-cols-[2.25rem_minmax(0,1fr)]"
          >
            <span className="select-none pr-3 text-right text-zinc-600">
              {index + 1}
            </span>
            <span className="whitespace-pre">
              {segmentCodeLine(line, language).map((segment, segmentIndex) => (
                <span
                  key={`${index}-${segmentIndex}`}
                  className={highlightToneClass(segment.tone)}
                >
                  {segment.text}
                </span>
              ))}
            </span>
          </span>
        ))}
      </code>
    </pre>
  )
}

function diffTone(status: BrokCodeDiffFile['status']) {
  if (status === 'created') return 'text-emerald-700'
  if (status === 'deleted') return 'text-rose-700'
  return 'text-sky-700'
}

function formatDiffBytes(value: number) {
  if (value < 1000) return `${value} B`
  return `${Math.round(value / 100) / 10} KB`
}

function DiffCodeBlock({
  label,
  content,
  empty
}: {
  label: string
  content: string | null
  empty: string
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-zinc-800 bg-[#101012]">
      <div className="border-b border-zinc-800 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400">
        {label}
      </div>
      <pre className="max-h-44 overflow-auto p-2.5 font-mono text-[11px] leading-5 text-zinc-100">
        {content ?? empty}
      </pre>
    </div>
  )
}

function RunDiffPanel({
  diffs,
  selectedDiff,
  selectedFile,
  onSelectDiff,
  onSelectFile,
  onOpenFile
}: {
  diffs: BrokCodeRunDiff[]
  selectedDiff: BrokCodeRunDiff | null
  selectedFile: BrokCodeDiffFile | null
  onSelectDiff: (diff: BrokCodeRunDiff) => void
  onSelectFile: (file: BrokCodeDiffFile) => void
  onOpenFile: (path: string) => void
}) {
  return (
    <div className="mb-2 grid max-h-[34vh] min-h-[190px] overflow-hidden rounded-lg border border-zinc-200 bg-white text-xs shadow-sm md:grid-cols-[190px_minmax(0,1fr)]">
      <div className="min-h-0 border-b border-zinc-200 bg-zinc-50 md:border-b-0 md:border-r">
        <div className="border-b border-zinc-200 px-2.5 py-2">
          <p className="font-medium text-zinc-950">Changes</p>
          <p className="text-[11px] text-zinc-500">
            {selectedDiff
              ? `${selectedDiff.totalFilesChanged} files changed`
              : 'Run BrokCode to review diffs.'}
          </p>
        </div>
        <div className="max-h-28 overflow-auto p-1 md:max-h-[calc(34vh-42px)]">
          {diffs.length === 0 ? (
            <p className="px-2 py-3 text-zinc-500">No run diffs yet.</p>
          ) : (
            diffs.map(diff => (
              <button
                key={diff.id}
                type="button"
                className={cn(
                  'w-full rounded-md px-2 py-1.5 text-left text-zinc-600 hover:bg-white hover:text-zinc-950',
                  selectedDiff?.id === diff.id &&
                    'bg-white font-medium text-zinc-950 shadow-sm'
                )}
                onClick={() => onSelectDiff(diff)}
              >
                <span className="block truncate">{diff.command}</span>
                <span className="block truncate text-[11px] text-zinc-500">
                  {diff.summary}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="flex items-start justify-between gap-2 border-b border-zinc-200 px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-950">
              {selectedDiff?.summary ?? 'No diff selected'}
            </p>
            <p className="truncate text-[11px] text-zinc-500">
              {selectedDiff
                ? [
                    selectedDiff.jobId ? `job ${selectedDiff.jobId}` : null,
                    selectedDiff.versionId
                      ? `version ${selectedDiff.versionId}`
                      : null,
                    new Date(selectedDiff.createdAt).toLocaleTimeString()
                  ]
                    .filter(Boolean)
                    .join(' - ')
                : 'Diffs are tied to run jobs and saved versions.'}
            </p>
          </div>
          {selectedFile && selectedFile.status !== 'deleted' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 rounded-full px-2.5 text-[11px]"
              onClick={() => onOpenFile(selectedFile.path)}
            >
              <FileCode2 className="size-3.5" />
              Open file
            </Button>
          )}
        </div>

        {!selectedDiff ? (
          <div className="flex h-full min-h-28 items-center justify-center px-4 text-center text-zinc-500">
            Changes from each run will appear here.
          </div>
        ) : selectedDiff.files.length === 0 ? (
          <div className="grid gap-2 p-3 text-zinc-600">
            <p>No file changes in this run.</p>
            {[...selectedDiff.runtimeChanges, ...selectedDiff.deployChanges]
              .filter(Boolean)
              .map(change => (
                <p key={change} className="rounded-md bg-zinc-50 px-2 py-1">
                  {change}
                </p>
              ))}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[180px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-auto border-b border-zinc-200 p-1 md:border-b-0 md:border-r">
              {selectedDiff.files.map(file => (
                <button
                  key={file.path}
                  type="button"
                  className={cn(
                    'w-full rounded-md px-2 py-1.5 text-left hover:bg-zinc-50',
                    selectedFile?.path === file.path && 'bg-zinc-50 shadow-sm'
                  )}
                  onClick={() => onSelectFile(file)}
                >
                  <span className="block truncate font-medium text-zinc-800">
                    {file.path}
                  </span>
                  <span
                    className={cn(
                      'block text-[11px] capitalize',
                      diffTone(file.status)
                    )}
                  >
                    {file.status} +{file.additions} -{file.deletions}
                  </span>
                </button>
              ))}
            </div>
            <div className="min-h-0 overflow-auto p-2">
              {selectedFile ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                    <Badge variant="secondary" className="rounded-full">
                      {selectedFile.status}
                    </Badge>
                    <span>
                      {formatDiffBytes(selectedFile.beforeSize)} to{' '}
                      {formatDiffBytes(selectedFile.afterSize)}
                    </span>
                    {selectedFile.truncated && (
                      <span>large diff summarized</span>
                    )}
                  </div>
                  <div className="grid gap-2 xl:grid-cols-2">
                    <DiffCodeBlock
                      label="Before"
                      content={selectedFile.before}
                      empty="File did not exist."
                    />
                    <DiffCodeBlock
                      label="After"
                      content={selectedFile.after}
                      empty="File was deleted."
                    />
                  </div>
                  {selectedDiff.runtimeChanges.length > 0 ||
                  selectedDiff.deployChanges.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-zinc-500">
                      {[
                        ...selectedDiff.runtimeChanges,
                        ...selectedDiff.deployChanges
                      ].map(change => (
                        <span
                          key={change}
                          className="rounded-full border border-zinc-200 px-2 py-1"
                        >
                          {change}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="p-3 text-zinc-500">Select a changed file.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatProjectBrainUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'just now'

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function ProjectBrainPanel({
  brain,
  hasProject,
  onSuggestedAction
}: {
  brain: BrokCodeProjectBrain
  hasProject: boolean
  onSuggestedAction: (action: string) => void
}) {
  return (
    <div className="grid max-h-[34vh] min-h-[250px] gap-3 overflow-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-zinc-700" />
            <p className="font-semibold text-zinc-950">Project Brain</p>
          </div>
          <p className="mt-1 text-zinc-500">
            {hasProject
              ? `Updated ${formatProjectBrainUpdatedAt(brain.updatedAt)}`
              : 'Start a project to persist the product memory.'}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 rounded-full">
          {brain.currentPages.length} pages
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <p className="text-[11px] uppercase text-zinc-400">Product</p>
          <p className="mt-1 font-medium text-zinc-950">{brain.product}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <p className="text-[11px] uppercase text-zinc-400">Audience</p>
          <p className="mt-1 text-zinc-700">{brain.audience}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <p className="text-[11px] uppercase text-zinc-400">Experience</p>
          <p className="mt-1 line-clamp-3 text-zinc-700">
            {brain.coreExperience}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <p className="text-[11px] uppercase text-zinc-400">Design</p>
          <p className="mt-1 text-zinc-700">{brain.designDirection}</p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] uppercase text-zinc-400">
          Current app map
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(brain.currentPages.length > 0
            ? brain.currentPages
            : ['First screen pending']
          ).map(page => (
            <Badge key={page} variant="secondary" className="rounded-full">
              {page}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] uppercase text-zinc-400">
            AI features
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(brain.aiFeatures.length > 0
              ? brain.aiFeatures
              : ['Not detected yet']
            ).map(feature => (
              <Badge key={feature} variant="outline" className="rounded-full">
                {feature}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] uppercase text-zinc-400">Backend</p>
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-zinc-700">
            {brain.backendSummary}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] uppercase text-zinc-400">
          Suggested next actions
        </p>
        <div className="flex flex-wrap gap-1.5">
          {brain.suggestedNextActions.map(action => (
            <Button
              key={action}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-[11px]"
              onClick={() => onSuggestedAction(action)}
            >
              <Wand2 className="size-3.5" />
              {action}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjectBackendPanel({
  backend,
  backendChecking,
  backendProvisioning,
  hasLiveRuntime,
  onCheck,
  onProvision
}: {
  backend: BrokCodeBackendMetadata
  backendChecking: boolean
  backendProvisioning: boolean
  hasLiveRuntime: boolean
  onCheck: () => void
  onProvision: () => void
}) {
  const capabilities = Object.entries(backend.capabilities ?? {})
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)

  return (
    <div className="grid max-h-[34vh] min-h-[220px] gap-3 overflow-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PlugZap className="size-4 text-zinc-700" />
            <p className="font-semibold text-zinc-950">Backend</p>
          </div>
          <p className="mt-1 truncate text-zinc-500">
            {backend.provider === 'insforge'
              ? backend.projectUrl || backend.status
              : 'No cloud backend connected.'}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 rounded-full">
          {backend.provider === 'insforge'
            ? backend.health === 'online'
              ? 'Online'
              : backend.status
            : 'None'}
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <p className="text-[11px] uppercase text-zinc-400">Provider</p>
          <p className="mt-1 font-medium text-zinc-950">{backend.provider}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <p className="text-[11px] uppercase text-zinc-400">Admin key</p>
          <p className="mt-1 text-zinc-700">
            {backend.adminKeyConfigured ? 'Configured' : 'Not configured'}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] uppercase text-zinc-400">
          Capabilities
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(capabilities.length > 0 ? capabilities : ['pending']).map(item => (
            <Badge key={item} variant="secondary" className="rounded-full">
              {item}
            </Badge>
          ))}
        </div>
      </div>

      {backend.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700">
          {backend.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {backend.provider === 'insforge' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            disabled={backendChecking}
            onClick={onCheck}
          >
            {backendChecking ? (
              <RefreshCcw className="size-3.5 animate-spin" />
            ) : (
              <Radar className="size-3.5" />
            )}
            Check backend
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            disabled={backendProvisioning || !hasLiveRuntime}
            onClick={onProvision}
          >
            {backendProvisioning ? (
              <RefreshCcw className="size-3.5 animate-spin" />
            ) : (
              <PlugZap className="size-3.5" />
            )}
            Add backend
          </Button>
        )}
      </div>
    </div>
  )
}

function RuntimeLogsPanel({
  runtimeDiagnostics,
  latestRun,
  runtimeError,
  onFixRuntimeError
}: {
  runtimeDiagnostics: BrokCodeRuntimeDiagnostics | null
  latestRun?: ExecutionRun
  runtimeError: string | null
  onFixRuntimeError: () => void
}) {
  const recentLogs = runtimeDiagnostics?.logs.slice(-12) ?? []

  return (
    <div className="grid max-h-[34vh] min-h-[220px] gap-3 overflow-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TerminalSquare className="size-4 text-zinc-700" />
            <p className="font-semibold text-zinc-950">Logs</p>
          </div>
          <p className="mt-1 text-zinc-500">
            {runtimeDiagnostics
              ? `Runtime ${runtimeDiagnostics.status}`
              : latestRun?.note || 'No runtime logs yet.'}
          </p>
        </div>
        {runtimeError ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-full px-3 text-xs"
            onClick={onFixRuntimeError}
          >
            <Wand2 className="size-3.5" />
            Fix
          </Button>
        ) : null}
      </div>

      {runtimeError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700">
          {runtimeError}
        </p>
      ) : null}

      {recentLogs.length > 0 ? (
        <div className="space-y-1.5">
          {recentLogs.map((log, index) => (
            <div
              key={`${log.at}-${index}`}
              className="rounded-lg border border-zinc-200 bg-zinc-950 p-2 font-mono text-[11px] leading-5 text-zinc-100"
            >
              <p className="text-zinc-400">
                {log.level} / {log.source}
              </p>
              <p>{log.message}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-zinc-500">
          Run the app to see install, dev-server, browser, and system logs here.
        </p>
      )}
    </div>
  )
}

function ProjectFilesPanel({
  files,
  loading,
  error,
  selectedFile,
  draft,
  editMode,
  saving,
  hasUnsavedChanges,
  onSelectFile,
  onDraftChange,
  onEditModeChange,
  onSave,
  onRefresh
}: {
  files: BrokCodeProjectFile[]
  loading: boolean
  error: string | null
  selectedFile: BrokCodeProjectFile | null
  draft: string
  editMode: boolean
  saving: boolean
  hasUnsavedChanges: boolean
  onSelectFile: (path: string) => void
  onDraftChange: (value: string) => void
  onEditModeChange: (value: boolean) => void
  onSave: () => void
  onRefresh: () => void
}) {
  const unsupported = isUnsupportedViewerFile(selectedFile)

  return (
    <div className="mb-2 grid max-h-[34vh] min-h-[190px] overflow-hidden rounded-lg border border-zinc-200 bg-white text-xs shadow-sm md:grid-cols-[170px_minmax(0,1fr)]">
      <div className="min-h-0 border-b border-zinc-200 bg-zinc-50 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-2.5 py-2">
          <div className="min-w-0">
            <p className="font-medium text-zinc-950">Files</p>
            <p className="text-[11px] text-zinc-500">{files.length} saved</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 rounded-full"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh files"
          >
            <RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} />
            <span className="sr-only">Refresh files</span>
          </Button>
        </div>
        <div className="max-h-28 overflow-auto p-1 md:max-h-[calc(34vh-42px)]">
          {loading && files.length === 0 ? (
            <p className="px-2 py-3 text-zinc-500">Loading files...</p>
          ) : error ? (
            <p className="px-2 py-3 text-rose-600">{error}</p>
          ) : files.length === 0 ? (
            <p className="px-2 py-3 text-zinc-500">No generated files yet.</p>
          ) : (
            files.map(file => (
              <button
                key={file.path}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-zinc-600 hover:bg-white hover:text-zinc-950',
                  selectedFile?.path === file.path &&
                    'bg-white font-medium text-zinc-950 shadow-sm'
                )}
                onClick={() => onSelectFile(file.path)}
              >
                <FileCode2 className="size-3.5 shrink-0" />
                <span className="truncate">{file.path}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-950">
              {selectedFile?.path ?? 'No file selected'}
            </p>
            <p className="text-[11px] text-zinc-500">
              {selectedFile
                ? `${languageLabel(selectedFile)}${hasUnsavedChanges ? ' - unsaved' : ''}`
                : 'Open a generated file to inspect it.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={editMode ? 'secondary' : 'outline'}
              className="h-7 rounded-full px-2.5 text-[11px]"
              disabled={!selectedFile || unsupported}
              onClick={() => onEditModeChange(!editMode)}
            >
              <Pencil className="size-3.5" />
              {editMode ? 'Viewing' : 'Edit'}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 rounded-full px-2.5 text-[11px]"
              disabled={!selectedFile || !hasUnsavedChanges || saving}
              onClick={onSave}
            >
              {saving ? (
                <RefreshCcw className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Save
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[#101012] text-zinc-100">
          {!selectedFile ? (
            <div className="flex h-full min-h-28 items-center justify-center px-4 text-center text-zinc-400">
              Select a file to inspect its source.
            </div>
          ) : unsupported ? (
            <div className="flex h-full min-h-28 items-center justify-center px-4 text-center text-zinc-400">
              This file type can be saved and previewed, but inline viewing is
              not supported here.
            </div>
          ) : editMode ? (
            <Textarea
              value={draft}
              onChange={event => onDraftChange(event.target.value)}
              className="min-h-44 rounded-none border-0 bg-[#101012] font-mono text-[11px] leading-5 text-zinc-100 focus-visible:ring-0 focus-visible:ring-offset-0"
              spellCheck={false}
            />
          ) : (
            <HighlightedCode file={selectedFile} />
          )}
        </div>
      </div>
    </div>
  )
}

function BrowserPreviewPanel({
  isRunning,
  previewInput,
  previewUrl,
  previewFrameKey,
  previewHealth,
  latestRun,
  onDirectLoad,
  onReload,
  runtimeLoading,
  runtimeSandbox,
  runtimeError,
  runtimeDiagnostics,
  onFixRuntimeError
}: {
  isRunning: boolean
  previewInput: string
  previewUrl: string
  previewFrameKey: number
  previewHealth: PreviewHealth
  latestRun?: ExecutionRun
  onDirectLoad: (value: string) => void
  onReload: () => void
  runtimeLoading: boolean
  runtimeSandbox: BrokCodeRuntimeSandbox | null
  runtimeError: string | null
  runtimeDiagnostics: BrokCodeRuntimeDiagnostics | null
  onFixRuntimeError: () => void
}) {
  const hasPreviewUrl = Boolean(previewUrl.trim())
  const isBlockedPreview = isBrokCodeWorkspaceUrl(previewUrl)
  const recentRuntimeLogs = runtimeDiagnostics?.logs.slice(-8) ?? []
  const lastRuntimeError = runtimeDiagnostics?.lastError ?? null
  const runtimeFailure =
    runtimeSandbox?.status === 'crashed' ||
    runtimeSandbox?.status === 'timed_out'
      ? {
          label:
            runtimeSandbox.status === 'timed_out'
              ? 'Runtime timeout'
              : 'Runtime crash',
          title:
            runtimeSandbox.status === 'timed_out'
              ? 'Runtime timed out'
              : 'Runtime crashed',
          detail:
            runtimeSandbox.health?.message ??
            lastRuntimeError?.message ??
            'The live app runtime stopped before the preview could recover.'
        }
      : null
  const healthFailure =
    !isRunning && previewHealth.status === 'offline'
      ? (() => {
          if (previewHealth.reason === 'not_found') {
            return {
              label: '404',
              title: 'Preview route missing',
              detail:
                previewHealth.message ||
                'The preview URL returned 404. The app may be missing its active entrypoint.'
            }
          }
          if (previewHealth.reason === 'blank') {
            return {
              label: 'Blank',
              title: 'Preview is blank',
              detail:
                previewHealth.message ||
                'The preview loaded, but no visible page content was detected.'
            }
          }
          if (previewHealth.reason === 'timeout') {
            return {
              label: 'Timeout',
              title: 'Preview timed out',
              detail:
                previewHealth.message ||
                'The preview server did not respond before the health check timed out.'
            }
          }
          if (previewHealth.reason === 'http_error') {
            return {
              label: previewHealth.httpStatus
                ? `HTTP ${previewHealth.httpStatus}`
                : 'HTTP error',
              title: 'Preview returned an error',
              detail:
                previewHealth.message ||
                'The preview server responded with an error status.'
            }
          }
          if (previewHealth.reason === 'blocked') {
            return {
              label: 'Blocked',
              title: 'Preview URL blocked',
              detail: previewHealth.message
            }
          }
          return {
            label: 'Offline',
            title: 'Preview is offline',
            detail:
              previewHealth.message ||
              'The preview server is not reachable yet.'
          }
        })()
      : null
  const previewFailure = runtimeFailure ?? healthFailure
  const previewStatus = isRunning
    ? 'updating'
    : previewFailure
      ? 'error'
      : previewHealth.status === 'offline' && hasPreviewUrl
        ? 'loaded'
        : previewHealth.status
  const healthTone =
    previewStatus === 'online'
      ? 'default'
      : previewStatus === 'checking' ||
          previewStatus === 'loaded' ||
          previewStatus === 'updating'
        ? 'secondary'
        : 'outline'
  const previewMessage =
    previewStatus === 'updating'
      ? hasPreviewUrl
        ? 'Building your changes. The preview below is the last saved version until the new run finishes.'
        : 'Building your first preview. It will open here automatically.'
      : previewFailure
        ? previewFailure.detail
        : previewStatus === 'loaded'
          ? 'Preview loaded. Health check may be blocked by the preview origin.'
          : previewHealth.message
  const runtimePorts = runtimeSandbox?.ports
    ?.map(port => port.port)
    .filter((port): port is number => typeof port === 'number')
    .join(', ')

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_30px_80px_-58px_rgba(24,24,27,0.6)] sm:rounded-2xl"
      data-testid="brokcode-preview-panel"
    >
      <div className="flex flex-col gap-2 border-b border-zinc-200/80 bg-white p-2.5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2">
          <p className="truncate text-xs font-semibold text-zinc-950">
            {hasPreviewUrl ? 'Cloud preview' : 'Preview is waiting'}
          </p>
          <p className="truncate text-[11px] text-zinc-500">
            {hasPreviewUrl
              ? previewInput || previewUrl
              : 'Brok opens the generated app here after the first build.'}
          </p>
        </div>
        <div className="mobile-chip-row flex items-center justify-end gap-1.5 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
          <Badge
            variant={healthTone}
            className={cn(
              'shrink-0 rounded-full',
              previewStatus === 'error' && 'border-rose-200 text-rose-700'
            )}
          >
            {previewStatus === 'online'
              ? 'Live'
              : previewStatus === 'checking'
                ? 'Checking'
                : previewStatus === 'updating'
                  ? 'Updating'
                  : previewStatus === 'error'
                    ? (previewFailure?.label ?? 'Error')
                    : previewStatus === 'loaded'
                      ? 'Loaded'
                      : previewStatus === 'offline'
                        ? 'Offline'
                        : 'Ready'}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0 rounded-full"
                title="Load preview"
              >
                <Globe className="size-4" />
                <span className="sr-only">Load preview</span>
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
            onClick={() => onDirectLoad(latestRun.previewUrl ?? previewUrl)}
          >
            Use last run: {latestRun.previewUrl}
          </button>
        )}
      </div>

      {isRunning && hasPreviewUrl && (
        <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
          <RefreshCcw className="size-3.5 animate-spin" />
          Updating this cloud preview. The visible app is the last saved version
          until Brok finishes writing files.
        </div>
      )}

      {runtimeError && (
        <p className="m-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {runtimeError}
        </p>
      )}

      {previewFailure && (
        <div
          className="mx-2 mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-950"
          data-testid="brokcode-preview-failure-state"
        >
          <p className="font-medium">{previewFailure.title}</p>
          <p className="mt-1 leading-5">{previewFailure.detail}</p>
        </div>
      )}

      {(runtimeSandbox || runtimeLoading) && (
        <div className="mx-2 mt-2 grid gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="font-medium text-zinc-950">
                {runtimeLoading
                  ? 'Loading runtime contract...'
                  : `Runtime ${runtimeSandbox?.status ?? 'preparing'}`}
              </p>
              <p className="mt-0.5 truncate">
                {runtimeSandbox
                  ? `${runtimeSandbox.appType.replace('_', ' ')} · ${runtimeSandbox.packageManager} · ${runtimeSandbox.workspacePath}`
                  : 'BrokCode is checking the latest project sandbox.'}
              </p>
            </div>
            {runtimeSandbox && (
              <div className="flex flex-wrap gap-1.5 sm:justify-end">
                <Badge variant="secondary" className="rounded-full">
                  {runtimeSandbox.devCommand}
                </Badge>
                {runtimePorts ? (
                  <Badge variant="outline" className="rounded-full">
                    ports {runtimePorts}
                  </Badge>
                ) : null}
              </div>
            )}
          </div>

          {(lastRuntimeError || recentRuntimeLogs.length > 0) && (
            <div className="rounded-md border border-zinc-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-950">Runtime logs</p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {lastRuntimeError
                      ? `${lastRuntimeError.source} error captured`
                      : `${recentRuntimeLogs.length} recent event${recentRuntimeLogs.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 rounded-full px-3 text-xs"
                  disabled={!lastRuntimeError && recentRuntimeLogs.length === 0}
                  onClick={onFixRuntimeError}
                >
                  <Wand2 className="size-3.5" />
                  Fix this
                </Button>
              </div>
              <div className="max-h-36 overflow-auto px-2.5 py-2 font-mono text-[11px] leading-5 text-zinc-600">
                {recentRuntimeLogs.map((log, index) => {
                  const location =
                    log.file || typeof log.line === 'number'
                      ? [
                          log.file,
                          typeof log.line === 'number' ? log.line : null,
                          typeof log.column === 'number' ? log.column : null
                        ]
                          .filter(
                            value =>
                              value !== null &&
                              value !== undefined &&
                              value !== ''
                          )
                          .join(':')
                      : ''
                  return (
                    <div
                      key={`${log.at}-${index}`}
                      className={cn(
                        'grid gap-1 border-b border-zinc-100 py-1 last:border-b-0 sm:grid-cols-[96px_1fr]',
                        log.level === 'error' && 'text-rose-700'
                      )}
                    >
                      <span className="uppercase text-zinc-400">
                        {log.source}
                      </span>
                      <span className="min-w-0 break-words">
                        {location ? `${location} ` : ''}
                        {log.message}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {latestRun?.previewUrl && (
        <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 xl:hidden">
          <Globe className="size-3.5" />
          Suggested from last run:
          <button
            className="truncate text-zinc-950 underline"
            onClick={() => onDirectLoad(latestRun.previewUrl ?? previewUrl)}
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
          <div className="relative h-full min-h-[330px] w-full sm:min-h-[520px]">
            <iframe
              key={previewFrameKey}
              src={previewUrl}
              data-testid="brokcode-preview-frame"
              title="Brok Code browser preview"
              className={cn(
                'h-full min-h-[330px] w-full bg-white transition-opacity sm:min-h-[520px]',
                isRunning && 'opacity-70'
              )}
              referrerPolicy="no-referrer"
              sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
            />
            {isRunning && (
              <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-zinc-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur">
                Updating preview...
              </div>
            )}
          </div>
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
