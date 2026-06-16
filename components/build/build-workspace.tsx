'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  BrokBuildPhase,
  BrokStreamEvent,
  InternalPlan,
  UserVisiblePlan
} from '@/lib/build/types'

import { BuildChatPanel } from './build-chat-panel'
import { BuildConsole } from './build-console'
import { BuildPlanCard } from './build-plan-card'
import { BuildPreviewPanel } from './build-preview-panel'
import { BuildProjectBrain } from './build-project-brain'
import { useBrokBuildStream } from './use-build-stream'

const AUTO_START_DELAY_MS = 4500

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
  }>({ status: 'idle', url: null, message: null })
  const startedRef = useRef(false)

  const { state, start, stop, sendEdit, send } = useBrokBuildStream()

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
    if (!plan) return
    const timer = setTimeout(() => {
      startBuild(initialPrompt)
    }, AUTO_START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [autoStart, autoStarted, plan, initialPrompt, startBuild])

  const phase = state.phase
  const isBuilding = useMemo(() => {
    return (
      phase !== 'idle' &&
      phase !== 'ready' &&
      phase !== 'failed'
    )
  }, [phase])

  const handleDeploy = useCallback(async () => {
    if (!state.projectId || deployState.status === 'publishing') return
    setDeployState({
      status: 'publishing',
      url: null,
      message: 'Publishing managed app...'
    })

    try {
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
      setDeployState({
        status: 'live',
        url,
        message:
          typeof body?.message === 'string'
            ? body.message
            : 'Managed app published.'
      })
    } catch (error) {
      setDeployState({
        status: 'failed',
        url: null,
        message: error instanceof Error ? error.message : 'Deploy failed.'
      })
    }
  }, [deployState.status, state.projectId])

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
      <WorkspaceHeader
        projectName={state.previewUrl ? projectName : projectName}
        phase={phase}
        progress={state.progress}
        previewUrl={state.previewUrl}
        deploymentUrl={deployState.url ?? state.deploymentUrl}
        deployStatus={deployState.status}
        deployMessage={deployState.message}
        projectId={state.projectId}
        onDeploy={() => {
          void handleDeploy()
        }}
        onRestart={() => {
          startedRef.current = false
          setAutoStarted(false)
          setShowPlanCard(true)
          setDeployState({ status: 'idle', url: null, message: null })
        }}
      />

      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(320px,28%)_minmax(0,1fr)_minmax(320px,28%)]">
        <BuildChatPanel
          prompt={initialPrompt}
          events={state.events}
          isBuilding={isBuilding}
          phase={phase}
          previewUrl={state.previewUrl}
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

        <BuildPreviewPanel
          previewUrl={state.previewUrl}
          phase={phase}
          files={state.files}
        />

        <BuildProjectBrain
          phase={phase}
          plan={plan}
          internalPlan={internalPlan}
          files={state.files}
          logs={state.logs}
          backendStatus={state.backendStatus}
          opencodeSessionId={state.opencodeSessionId}
          events={state.events}
        />
      </div>

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
    </div>
  )
}

type HeaderProps = {
  projectName: string
  phase: BrokBuildPhase
  progress: number
  previewUrl: string | null
  deploymentUrl: string | null
  deployStatus: 'idle' | 'publishing' | 'live' | 'failed'
  deployMessage: string | null
  projectId: string | null
  onDeploy: () => void
  onRestart: () => void
}

export function WorkspaceHeader({
  projectName,
  phase,
  progress,
  previewUrl,
  deploymentUrl,
  deployStatus,
  deployMessage,
  projectId,
  onDeploy,
  onRestart
}: HeaderProps) {
  const brokCodeProjectUrl = projectId
    ? `/brokcode?project=${encodeURIComponent(projectId)}`
    : null

  return (
    <header className="flex h-12 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
        <span className="rounded-md bg-foreground/5 px-2 py-0.5 text-xs uppercase tracking-[0.15em] text-muted-foreground">
          Brok Build
        </span>
        <span className="text-muted-foreground">/</span>
        <span className="truncate text-foreground">{projectName}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="hidden items-center gap-1 sm:inline-flex">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          {phaseLabel(phase)} · {progress}%
        </span>
        <a
          href={previewUrl ?? '#'}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!previewUrl}
          className="rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          Preview
        </a>
        <button
          type="button"
          onClick={onDeploy}
          disabled={!projectId || deployStatus === 'publishing'}
          title={deployMessage ?? 'Publish the current managed app'}
          className="rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {deployStatus === 'publishing'
            ? 'Publishing...'
            : deployStatus === 'live'
              ? 'Published'
              : deployStatus === 'failed'
                ? 'Retry deploy'
                : 'Deploy'}
        </button>
        {deploymentUrl ? (
          <a
            href={deploymentUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground"
          >
            Live
          </a>
        ) : null}
        <a
          href={brokCodeProjectUrl ?? '#'}
          aria-disabled={!brokCodeProjectUrl}
          className="rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          Export
        </a>
        <button
          type="button"
          onClick={onRestart}
          className="rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground"
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
