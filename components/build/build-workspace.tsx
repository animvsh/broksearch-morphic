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

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-background">
      <WorkspaceHeader
        projectName={state.previewUrl ? projectName : projectName}
        phase={phase}
        progress={state.progress}
        previewUrl={state.previewUrl}
        deploymentUrl={state.deploymentUrl}
        projectId={state.projectId}
        onRestart={() => {
          startedRef.current = false
          setAutoStarted(false)
          setShowPlanCard(true)
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
  projectId: string | null
  onRestart: () => void
}

function WorkspaceHeader({
  projectName,
  phase,
  progress,
  previewUrl,
  deploymentUrl,
  projectId,
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
        <a
          href={deploymentUrl ?? previewUrl ?? '#'}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!deploymentUrl && !previewUrl}
          className="rounded-md border border-border/60 bg-background px-2.5 py-1 transition hover:border-foreground/30 hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          Deploy
        </a>
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
      return 'Designing schema'
    case 'preparing_backend':
      return 'Preparing backend'
    case 'starting_opencode':
      return 'Starting OpenCode'
    case 'generating_frontend':
      return 'Generating frontend'
    case 'wiring_backend':
      return 'Wiring backend'
    case 'building_preview':
      return 'Building preview'
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
