'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { BrokCodeManagedDeployReadiness } from '@/lib/brokcode/deploy-readiness-client'
import type {
  BrokBuildPhase,
  BrokStreamEvent,
  InternalPlan,
  UserVisiblePlan
} from '@/lib/build/types'
import { cn } from '@/lib/utils'

import { BuildChatPanel } from './build-chat-panel'
import { BuildConsole } from './build-console'
import { BuildPlanCard } from './build-plan-card'
import { BuildPreviewPanel } from './build-preview-panel'
import {
  BuildProjectBrain,
  type FilesUpdateMetadata
} from './build-project-brain'
import { useBrokBuildStream } from './use-build-stream'

const AUTO_START_DELAY_MS = 4500
type MobileWorkspacePanel = 'chat' | 'preview' | 'files' | 'console'

type BackendApplyResult = {
  provider?: unknown
  status?: unknown
  steps?: unknown
}

function errorMessageFromBody(
  body: { error?: unknown; message?: unknown } | null,
  fallback: string
) {
  if (typeof body?.error === 'string') return body.error
  if (
    body?.error &&
    typeof body.error === 'object' &&
    'message' in body.error &&
    typeof body.error.message === 'string'
  ) {
    return body.error.message
  }
  if (typeof body?.message === 'string') return body.message
  return fallback
}

function buildBackendRewirePrompt({
  applyResult,
  backendPromptText
}: {
  applyResult: BackendApplyResult
  backendPromptText: string | null
}) {
  const stepCount = Array.isArray(applyResult.steps)
    ? applyResult.steps.length
    : 0
  return [
    'The InsForge backend has been provisioned and its planned resources were applied.',
    `Backend apply status: ${String(applyResult.status ?? 'unknown')}.`,
    stepCount > 0 ? `Applied/check steps: ${stepCount}.` : null,
    backendPromptText
      ? `Use this live InsForge backend context when rewriting the app. Replace local/sample-only state with safe browser calls to the public backend URL and anon/app key where available. Keep the admin key server-only and do not write it into source.\n\n${backendPromptText}`
      : 'Rewrite the app so backend-backed views and forms are wired for InsForge instead of sample-only local state. Keep secrets out of generated source.',
    'Preserve the current design and user-facing workflow while adding clear loading, empty, and failure states for backend-backed data.'
  ]
    .filter(Boolean)
    .join('\n\n')
}

export type BrokBuildWorkspaceProps = {
  initialPrompt: string
  autoStart: boolean
  projectName?: string
}

export function BrokBuildWorkspace({
  initialPrompt,
  autoStart,
  projectName = 'New Brok App'
}: BrokBuildWorkspaceProps) {
  const [plan, setPlan] = useState<UserVisiblePlan | null>(null)
  const [internalPlan, setInternalPlan] = useState<InternalPlan | null>(null)
  const [showPlanCard, setShowPlanCard] = useState(true)
  const [autoStarted, setAutoStarted] = useState(false)
  const [deployState, setDeployState] = useState<{
    status: 'idle' | 'publishing' | 'live' | 'failed'
    url: string | null
    message: string | null
    kind: 'managed' | 'external' | null
  }>({ status: 'idle', url: null, message: null, kind: null })
  const [deployReadiness, setDeployReadiness] = useState<{
    status: 'idle' | 'checking' | 'ready' | 'blocked' | 'failed'
    message: string | null
    previewUrl: string | null
    deploymentUrl: string | null
  }>({
    status: 'idle',
    message: null,
    previewUrl: null,
    deploymentUrl: null
  })
  const [backendProvision, setBackendProvision] = useState<{
    status: 'idle' | 'provisioning' | 'ready' | 'failed'
    message: string | null
  }>({ status: 'idle', message: null })
  const [previewReloadToken, setPreviewReloadToken] = useState(0)
  const [mobilePanel, setMobilePanel] = useState<MobileWorkspacePanel>('chat')
  const startedRef = useRef(false)

  const { state, start, stop, sendEdit, send, setFiles } = useBrokBuildStream()

  const startBuild = useCallback(
    (prompt: string) => {
      if (startedRef.current) return
      startedRef.current = true
      setShowPlanCard(false)
      setAutoStarted(true)
      void start(prompt)
    },
    [start]
  )

  // Initial plan fetch
  useEffect(() => {
    let cancelled = false
    async function fetchPlan() {
      try {
        const res = await fetch('/api/build/plan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: initialPrompt })
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          userPlan: UserVisiblePlan
          internalPlan: InternalPlan
        }
        if (cancelled) return
        setPlan(data.userPlan)
        setInternalPlan(data.internalPlan)
      } catch {
        // ignore — we just won't show the plan card
      }
    }
    void fetchPlan()
    return () => {
      cancelled = true
    }
  }, [initialPrompt])

  // Auto-start logic per PRD: "auto-start after a short pause unless the user clicks adjust"
  useEffect(() => {
    if (!autoStart || autoStarted) return
    if (!initialPrompt.trim()) return
    const timer = setTimeout(() => {
      startBuild(initialPrompt)
    }, AUTO_START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [autoStart, autoStarted, initialPrompt, startBuild])

  const phase = state.phase
  const isBuilding = useMemo(() => {
    return (
      phase !== 'idle' &&
      phase !== 'ready' &&
      phase !== 'failed'
    )
  }, [phase])
  const canSendEdit = phase !== 'idle' && !showPlanCard

  const checkDeployReadiness = useCallback(async (projectId: string) => {
    setDeployReadiness({
      status: 'checking',
      message: 'Checking saved files...',
      previewUrl: null,
      deploymentUrl: null
    })

    const response = await fetch(
      `/api/brokcode/deploy?projectId=${encodeURIComponent(projectId)}&source=browser`
    )
    const body = (await response.json().catch(() => null)) as {
      readiness?: BrokCodeManagedDeployReadiness
      deploymentUrl?: unknown
      previewUrl?: unknown
      error?: { message?: unknown }
    } | null
    if (!response.ok || !body?.readiness) {
      throw new Error(
        typeof body?.error?.message === 'string'
          ? body.error.message
          : `Could not check publish readiness (${response.status}).`
      )
    }

    const deploymentUrl =
      typeof body.deploymentUrl === 'string' ? body.deploymentUrl : null
    const previewUrl =
      typeof body.previewUrl === 'string'
        ? body.previewUrl
        : body.readiness.previewUrl
    const nextReadiness = {
      status: body.readiness.ready ? ('ready' as const) : ('blocked' as const),
      message: body.readiness.message,
      previewUrl,
      deploymentUrl
    }
    setDeployReadiness(nextReadiness)
    return { ...nextReadiness, readiness: body.readiness }
  }, [])

  const handleCheckDeployReadiness = useCallback(async () => {
    if (!state.projectId || deployReadiness.status === 'checking') return
    try {
      await checkDeployReadiness(state.projectId)
    } catch (error) {
      setDeployReadiness({
        status: 'failed',
        message:
          error instanceof Error
            ? error.message
            : 'Could not check publish readiness.',
        previewUrl: null,
        deploymentUrl: null
      })
    }
  }, [checkDeployReadiness, deployReadiness.status, state.projectId])

  const handleDeploy = useCallback(async () => {
    if (!state.projectId || deployState.status === 'publishing') return
    try {
      const readiness = await checkDeployReadiness(state.projectId)
      if (!readiness.readiness.ready) {
        setDeployState({
          status: 'failed',
          url: null,
          message: readiness.message,
          kind: null
        })
        return
      }

      setDeployState({
        status: 'publishing',
        url: null,
        message: 'Publishing to Brok managed URL...',
        kind: 'managed'
      })
      const response = await fetch('/api/brokcode/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          source: 'browser'
        })
      })
      const body = (await response.json().catch(() => null)) as {
        deploymentUrl?: unknown
        deploymentPreviewUrl?: unknown
        previewUrl?: unknown
        deploymentKind?: unknown
        externalDeployment?: unknown
        message?: unknown
        error?: { message?: unknown }
      } | null
      if (!response.ok) {
        throw new Error(
          typeof body?.error?.message === 'string'
            ? body.error.message
            : `Deploy failed (${response.status}).`
        )
      }

      const url =
        typeof body?.deploymentUrl === 'string'
          ? body.deploymentUrl
          : typeof body?.deploymentPreviewUrl === 'string'
            ? body.deploymentPreviewUrl
          : typeof body?.previewUrl === 'string'
              ? body.previewUrl
              : null
      const deploymentKind =
        body?.externalDeployment === true || body?.deploymentKind === 'external'
          ? 'external'
          : 'managed'
      setDeployState({
        status: 'live',
        url,
        kind: deploymentKind,
        message:
          typeof body?.message === 'string'
            ? body.message
            : deploymentKind === 'external'
              ? 'External deployment triggered.'
              : 'Brok managed app published.'
      })
    } catch (error) {
      setDeployState({
        status: 'failed',
        url: null,
        message: error instanceof Error ? error.message : 'Deploy failed.',
        kind: null
      })
    }
  }, [checkDeployReadiness, deployState.status, state.projectId])

  const handleProvisionBackend = useCallback(async () => {
    if (!state.projectId || backendProvision.status === 'provisioning') return
    setBackendProvision({
      status: 'provisioning',
      message: 'Provisioning InsForge...'
    })

    try {
      const response = await fetch('/api/brokcode/projects/insforge/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: state.projectId,
          projectName
        })
      })
      const body = (await response.json().catch(() => null)) as {
        backend?: { status?: unknown; health?: unknown }
        message?: unknown
        error?: unknown
      } | null
      if (!response.ok) {
        throw new Error(errorMessageFromBody(body, `Backend provision failed (${response.status}).`))
      }

      const ready =
        body?.backend?.status === 'ready' || body?.backend?.health === 'online'
      if (!ready) {
        setBackendProvision({
          status: 'provisioning',
          message:
            typeof body?.message === 'string'
              ? body.message
              : 'InsForge backend is warming up.'
        })
        return
      }

      setBackendProvision({
        status: 'provisioning',
        message: 'Applying backend schema...'
      })
      const applyResponse = await fetch(
        `/api/brokcode/projects/${encodeURIComponent(state.projectId)}/backend/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun: false })
        }
      )
      const applyBody = (await applyResponse.json().catch(() => null)) as {
        result?: BackendApplyResult
        error?: unknown
        message?: unknown
      } | null
      if (!applyResponse.ok || applyBody?.result?.status === 'failed') {
        throw new Error(
          errorMessageFromBody(
            applyBody,
            `Backend apply failed (${applyResponse.status}).`
          )
        )
      }

      setBackendProvision({
        status: 'provisioning',
        message: 'Fetching live backend context...'
      })
      const contextResponse = await fetch(
        `/api/brokcode/projects/${encodeURIComponent(state.projectId)}/backend/context`
      )
      const contextBody = (await contextResponse.json().catch(() => null)) as {
        promptText?: unknown
        error?: unknown
        message?: unknown
      } | null
      if (!contextResponse.ok) {
        throw new Error(
          errorMessageFromBody(
            contextBody,
            `Backend context fetch failed (${contextResponse.status}).`
          )
        )
      }
      const backendPromptText =
        typeof contextBody?.promptText === 'string' &&
        contextBody.promptText.trim()
          ? contextBody.promptText
          : null
      if (!backendPromptText) {
        throw new Error(
          'Live InsForge backend context was empty. Check backend health and retry Backend setup.'
        )
      }

      setDeployReadiness({
        status: 'idle',
        message: 'Backend applied. Recheck publish readiness after rewiring.',
        previewUrl: null,
        deploymentUrl: null
      })
      setBackendProvision({
        status: 'provisioning',
        message: 'Rewiring app to InsForge with BrokCode runtime...'
      })
      const applyResult = applyBody?.result ?? {}
      const rewired = await send(
        initialPrompt,
        buildBackendRewirePrompt({
          applyResult,
          backendPromptText
        }),
        { requireBrokCodeExecution: true }
      )
      setBackendProvision({
        status: rewired ? 'ready' : 'failed',
        message: rewired
          ? 'InsForge backend applied and app rewired. Recheck publish readiness.'
          : 'InsForge backend applied, but required BrokCode rewiring failed.'
      })
    } catch (error) {
      setBackendProvision({
        status: 'failed',
        message:
          error instanceof Error ? error.message : 'Backend provision failed.'
      })
    }
  }, [
    backendProvision.status,
    initialPrompt,
    projectName,
    send,
    state.projectId
  ])

  const chatPanel = (
    <BuildChatPanel
      prompt={initialPrompt}
      events={state.events}
      isBuilding={isBuilding}
      phase={phase}
      previewUrl={state.previewUrl}
      canSendEdit={canSendEdit}
      onSendEdit={message => {
        void sendEdit(message)
      }}
      planCard={
        showPlanCard && plan ? (
          <BuildPlanCard
            plan={plan}
            internalPlan={internalPlan}
            autoStarted={autoStarted}
            onStart={() => startBuild(initialPrompt)}
            onAdjust={() => {
              setShowPlanCard(false)
            }}
          />
        ) : null
      }
    />
  )

  const previewPanel = (
    <BuildPreviewPanel
      previewUrl={state.previewUrl}
      phase={phase}
      files={state.files}
      degraded={state.projectDegraded}
      errorMessage={state.errorMessage}
      unavailableReason={state.previewUnavailableReason}
      reloadToken={previewReloadToken}
    />
  )

  const projectBrain = (
    <BuildProjectBrain
      projectId={state.projectId}
      phase={phase}
      plan={plan}
      internalPlan={internalPlan}
      backendPlan={state.backendPlan}
      files={state.files}
      onFilesUpdated={(
        updatedFiles,
        reason,
        metadata?: FilesUpdateMetadata
      ) => {
        setFiles(updatedFiles, metadata)
        if (reason !== 'saved') return
        setDeployReadiness({
          status: 'idle',
          message:
            metadata?.previewUnavailableReason ??
            'Files changed. Recheck publish readiness.',
          previewUrl: null,
          deploymentUrl: null
        })
        setDeployState({
          status: 'idle',
          url: null,
          message: null,
          kind: null
        })
        setPreviewReloadToken(token => token + 1)
      }}
      logs={state.logs}
      backendStatus={state.backendStatus}
      opencodeSessionId={state.opencodeSessionId}
      events={state.events}
    />
  )

  const consolePanel = (
    <BuildConsole
      phase={phase}
      progress={state.progress}
      events={state.events}
      onCancel={() => {
        stop()
      }}
      onRetry={() => {
        startedRef.current = false
        setAutoStarted(false)
        startBuild(initialPrompt)
      }}
      onSendEdit={message => {
        void send(initialPrompt, message)
      }}
    />
  )

  return (
    <div className="grid h-full grid-rows-[auto_auto_minmax(0,1fr)] bg-background lg:grid-rows-[auto_minmax(0,1fr)_auto]">
      <WorkspaceHeader
        projectName={state.previewUrl ? projectName : projectName}
        phase={phase}
        progress={state.progress}
        previewUrl={state.previewUrl}
        deploymentUrl={deployState.url ?? state.deploymentUrl}
        deploymentKind={deployState.kind}
        deployStatus={deployState.status}
        deployMessage={deployState.message}
        deployReadinessStatus={deployReadiness.status}
        deployReadinessMessage={deployReadiness.message}
        projectSource={state.projectSource}
        projectDegraded={state.projectDegraded}
        projectMessage={state.projectMessage}
        projectId={state.projectId}
        onDeploy={() => {
          void handleDeploy()
        }}
        onCheckDeployReadiness={() => {
          void handleCheckDeployReadiness()
        }}
        onRestart={() => {
          startedRef.current = false
          setAutoStarted(false)
          setShowPlanCard(true)
          setDeployState({
            status: 'idle',
            url: null,
            message: null,
            kind: null
          })
          setBackendProvision({ status: 'idle', message: null })
        }}
        backendStatus={backendProvision.status}
        backendMessage={backendProvision.message}
        onProvisionBackend={() => {
          void handleProvisionBackend()
        }}
      />

      <MobilePanelTabs
        activePanel={mobilePanel}
        onChange={setMobilePanel}
        hasPreview={!!state.previewUrl || state.files.length > 0}
        hasProject={!!state.projectId || state.files.length > 0}
        hasConsole={state.events.length > 0 || phase !== 'idle'}
      />

      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(320px,28%)_minmax(0,1fr)_minmax(320px,28%)]">
        <div className={cn('min-h-0', mobilePanel === 'chat' ? 'flex' : 'hidden', 'lg:flex')}>
          {chatPanel}
        </div>
        <div className={cn('min-h-0', mobilePanel === 'preview' ? 'flex' : 'hidden', 'lg:flex')}>
          {previewPanel}
        </div>
        <div className={cn('min-h-0', mobilePanel === 'files' ? 'flex' : 'hidden', 'lg:flex')}>
          {projectBrain}
        </div>
        <div className={cn('min-h-0', mobilePanel === 'console' ? 'flex' : 'hidden', 'lg:hidden')}>
          {consolePanel}
        </div>
      </div>

      <div className="hidden lg:block">{consolePanel}</div>
    </div>
  )
}

function MobilePanelTabs({
  activePanel,
  hasPreview,
  hasProject,
  hasConsole,
  onChange
}: {
  activePanel: MobileWorkspacePanel
  hasPreview: boolean
  hasProject: boolean
  hasConsole: boolean
  onChange: (panel: MobileWorkspacePanel) => void
}) {
  const tabs: Array<{
    id: MobileWorkspacePanel
    label: string
    enabled: boolean
  }> = [
    { id: 'chat', label: 'Chat', enabled: true },
    { id: 'preview', label: 'Preview', enabled: hasPreview },
    { id: 'files', label: 'Files', enabled: hasProject },
    { id: 'console', label: 'Console', enabled: hasConsole }
  ]

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border/60 bg-background px-2 py-2 lg:hidden">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          disabled={!tab.enabled}
          onClick={() => onChange(tab.id)}
          className={cn(
            'min-h-11 flex-1 rounded-md border px-3 text-xs font-medium transition disabled:pointer-events-none disabled:opacity-45',
            activePanel === tab.id
              ? 'border-foreground/30 bg-foreground text-background'
              : 'border-border/60 bg-background text-muted-foreground'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

type HeaderProps = {
  projectName: string
  phase: BrokBuildPhase
  progress: number
  previewUrl: string | null
  deploymentUrl: string | null
  deploymentKind?: 'managed' | 'external' | null
  deployStatus: 'idle' | 'publishing' | 'live' | 'failed'
  deployMessage: string | null
  deployReadinessStatus: 'idle' | 'checking' | 'ready' | 'blocked' | 'failed'
  deployReadinessMessage: string | null
  projectSource: 'brokcode_execute' | 'degraded_fallback' | null
  projectDegraded: boolean
  projectMessage: string | null
  backendStatus: 'idle' | 'provisioning' | 'ready' | 'failed'
  backendMessage: string | null
  projectId: string | null
  onDeploy: () => void
  onCheckDeployReadiness: () => void
  onProvisionBackend: () => void
  onRestart: () => void
}

export function WorkspaceHeader({
  projectName,
  phase,
  progress,
  previewUrl,
  deploymentUrl,
  deploymentKind = null,
  deployStatus,
  deployMessage,
  deployReadinessStatus,
  deployReadinessMessage,
  projectSource,
  projectDegraded,
  projectMessage,
  backendStatus,
  backendMessage,
  projectId,
  onDeploy,
  onCheckDeployReadiness,
  onProvisionBackend,
  onRestart
}: HeaderProps) {
  const brokCodeProjectUrl = projectId
    ? `/brokcode?project=${encodeURIComponent(projectId)}`
    : null

  return (
    <header className="flex min-h-12 flex-col gap-2 border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur sm:px-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground/80">
        <span className="rounded-md bg-foreground/5 px-2 py-0.5 text-xs uppercase tracking-[0.15em] text-muted-foreground">
          Brok Build
        </span>
        <span className="text-muted-foreground">/</span>
        <span className="truncate text-foreground">{projectName}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground lg:justify-end">
        <span className="hidden items-center gap-1 sm:inline-flex">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          {phaseLabel(phase)} · {progress}%
        </span>
        {projectSource ? (
          <span
            role={projectDegraded ? 'alert' : 'status'}
            title={projectMessage ?? undefined}
            className={cn(
              'rounded-md border px-2.5 py-1',
              projectDegraded
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            )}
          >
            {projectDegraded ? 'Fallback preview' : 'Runtime build'}
          </span>
        ) : null}
        <a
          href={previewUrl ?? '#'}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!previewUrl}
          className="inline-flex min-h-11 items-center rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          Preview
        </a>
        <button
          type="button"
          onClick={onProvisionBackend}
          disabled={!projectId || backendStatus === 'provisioning'}
          title={backendMessage ?? 'Provision an InsForge backend'}
          className="inline-flex min-h-11 items-center rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {backendStatus === 'provisioning'
            ? 'Provisioning...'
            : backendStatus === 'ready'
              ? 'Backend ready'
              : backendStatus === 'failed'
                ? 'Retry backend'
                : 'Backend'}
        </button>
        {backendMessage ? (
          <span
            role={backendStatus === 'failed' ? 'alert' : 'status'}
            className={cn(
              'max-w-[220px] truncate text-[11px]',
              backendStatus === 'failed'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-muted-foreground'
            )}
          >
            {backendMessage}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onDeploy}
          disabled={
            !projectId ||
            deployStatus === 'publishing' ||
            deployReadinessStatus === 'checking'
          }
          title={
            deployMessage ??
            deployReadinessMessage ??
            'Publish the current app to its Brok managed URL'
          }
          className="inline-flex min-h-11 items-center rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {deployStatus === 'publishing'
            ? 'Publishing...'
            : deployStatus === 'live'
              ? 'Published'
              : deployStatus === 'failed'
                ? 'Retry publish'
                : 'Publish managed'}
        </button>
        <button
          type="button"
          onClick={onCheckDeployReadiness}
          disabled={!projectId || deployReadinessStatus === 'checking'}
          title={deployReadinessMessage ?? 'Check managed publish readiness'}
          className={cn(
            'inline-flex min-h-11 items-center rounded-md border px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
            deployReadinessStatus === 'ready'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : deployReadinessStatus === 'blocked' ||
                  deployReadinessStatus === 'failed'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-border/60 bg-background'
          )}
        >
          {deployReadinessStatus === 'checking'
            ? 'Checking...'
            : deployReadinessStatus === 'ready'
              ? 'Deploy ready'
              : deployReadinessStatus === 'blocked'
                ? 'Deploy blocked'
                : deployReadinessStatus === 'failed'
                  ? 'Check failed'
                  : 'Check publish'}
        </button>
        {deployReadinessMessage ? (
          <span
            role={
              deployReadinessStatus === 'blocked' ||
              deployReadinessStatus === 'failed'
                ? 'alert'
                : 'status'
            }
            className={cn(
              'max-w-[260px] truncate text-[11px]',
              deployReadinessStatus === 'blocked' ||
                deployReadinessStatus === 'failed'
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-muted-foreground'
            )}
          >
            {deployReadinessMessage}
          </span>
        ) : null}
        {deploymentUrl ? (
          <a
            href={deploymentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground"
          >
            {deploymentKind === 'external' ? 'External deploy' : 'Managed app'}
          </a>
        ) : null}
        {deployMessage ? (
          <span
            role={deployStatus === 'failed' ? 'alert' : 'status'}
            className={cn(
              'max-w-[220px] truncate text-[11px]',
              deployStatus === 'failed'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-muted-foreground'
            )}
          >
            {deployMessage}
          </span>
        ) : null}
        <a
          href={brokCodeProjectUrl ?? '#'}
          aria-disabled={!brokCodeProjectUrl}
          className="inline-flex min-h-11 items-center rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          Export
        </a>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex min-h-11 items-center rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground"
        >
          Restart
        </button>
      </div>
    </header>
  )
}

function phaseLabel(phase: BrokBuildPhase) {
  switch (phase) {
    case 'idle':
      return 'Idle'
    case 'understanding':
      return 'Understanding'
    case 'planning_core_modules':
      return 'Planning modules'
    case 'designing_backend_schema':
      return 'Planning data model'
    case 'preparing_backend':
      return 'Preparing scaffold'
    case 'starting_opencode':
      return 'Creating BrokCode project'
    case 'generating_frontend':
      return 'Generating frontend'
    case 'wiring_backend':
      return 'Wiring interactions'
    case 'building_preview':
      return 'Publishing preview'
    case 'ready':
      return 'Ready'
    case 'failed':
      return 'Failed'
    case 'adjusting':
      return 'Adjusting'
    default:
      return phase
  }
}

export type BuildStateSlice = {
  events: BrokStreamEvent[]
}
