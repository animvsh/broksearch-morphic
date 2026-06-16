'use client'

import { useEffect, useRef, useState } from 'react'

import { CheckCircle2, CircleDot, Loader2, RotateCcw, X } from 'lucide-react'

import type { BrokBuildPhase, BrokStreamEvent } from '@/lib/build/types'
import { PHASE_LABELS } from '@/lib/build/types'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

const PHASE_ORDER: BrokBuildPhase[] = [
  'understanding',
  'planning_core_modules',
  'designing_backend_schema',
  'preparing_backend',
  'starting_opencode',
  'generating_frontend',
  'wiring_backend',
  'building_preview',
  'ready'
]

type ConsoleProps = {
  phase: BrokBuildPhase
  progress: number
  events: BrokStreamEvent[]
  onCancel: () => void
  onRetry: () => void
  onSendEdit: (message: string) => void
}

export function BuildConsole({
  phase,
  progress,
  events,
  onCancel,
  onRetry,
  onSendEdit
}: ConsoleProps) {
  const [prompt, setPrompt] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events.length])

  return (
    <div className="grid h-44 grid-cols-1 border-t border-border/60 bg-muted/30 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col overflow-hidden border-r border-border/60">
        <div className="flex h-8 items-center justify-between border-b border-border/60 bg-background px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>Build phases</span>
          <span>{progress}%</span>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 text-xs">
          {PHASE_ORDER.map(phaseKey => {
            const status = phaseStatus(phaseKey, phase)
            return (
              <div
                key={phaseKey}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-transparent px-2 py-1 transition',
                  status === 'active' && 'border-border/60 bg-background text-foreground',
                  status === 'done' && 'text-foreground/60',
                  status === 'pending' && 'text-muted-foreground/60'
                )}
              >
                {status === 'done' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : status === 'active' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/60" />
                ) : (
                  <CircleDot className="h-3.5 w-3.5 text-muted-foreground/40" />
                )}
                <span className="flex-1">{PHASE_LABELS[phaseKey]}</span>
              </div>
            )
          })}
          {phase === 'failed' ? (
            <div className="mt-1 flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-600 dark:text-rose-400">
              <CircleDot className="h-3 w-3" /> Build failed
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="flex h-8 items-center justify-between border-b border-border/60 bg-background px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>Build console / BrokCode scaffold</span>
          <div className="flex items-center gap-2">
            {phase !== 'idle' && phase !== 'ready' && phase !== 'failed' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="h-6 gap-1 px-2 text-[10px] uppercase tracking-[0.18em]"
              >
                <X className="h-3 w-3" /> Cancel
              </Button>
            ) : null}
            {phase === 'failed' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="h-6 gap-1 px-2 text-[10px] uppercase tracking-[0.18em]"
              >
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            ) : null}
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
          {events.length === 0 ? (
            <p className="text-muted-foreground/70">No build activity yet.</p>
          ) : (
            events.map((event, i) => (
              <ConsoleLine key={i} event={event} />
            ))
          )}
        </div>
        <form
          className="flex items-center gap-2 border-t border-border/60 bg-background px-2 py-1.5"
          onSubmit={e => {
            e.preventDefault()
            const msg = prompt.trim()
            if (!msg) return
            onSendEdit(msg)
            setPrompt('')
          }}
        >
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            &gt;
          </span>
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Send a scaffold edit..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] uppercase tracking-[0.18em]"
            disabled={!prompt.trim()}
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  )
}

function ConsoleLine({ event }: { event: BrokStreamEvent }) {
  if (event.kind === 'phase') {
    return (
      <div className="flex gap-2">
        <span className="text-muted-foreground/70">~</span>
        <span className="text-foreground/90">{event.message}</span>
      </div>
    )
  }
  if (event.kind === 'progress') {
    return (
      <div className="flex gap-2 text-muted-foreground/80">
        <span>·</span>
        <span>
          {PHASE_LABELS[event.phase] ?? event.phase} → {event.percent}%
        </span>
      </div>
    )
  }
  if (event.kind === 'log') {
    return (
      <div className="flex gap-2">
        <span className="text-muted-foreground/70">·</span>
        <span
          className={cn(
            event.level === 'error' && 'text-rose-600 dark:text-rose-400',
            event.level === 'warn' && 'text-amber-600 dark:text-amber-400'
          )}
        >
          {event.message}
        </span>
      </div>
    )
  }
  if (event.kind === 'files') {
    return (
      <div className="flex gap-2 text-emerald-600 dark:text-emerald-400">
        <span>+</span>
        <span>generated {event.files.length} files</span>
      </div>
    )
  }
  if (event.kind === 'opencode_session') {
    return (
      <div className="flex gap-2 text-foreground/80">
        <span>#</span>
        <span>managed scaffold session {event.sessionId}</span>
      </div>
    )
  }
  if (event.kind === 'backend_status') {
    return (
      <div className="flex gap-2 text-foreground/80">
        <span>~</span>
        <span>starter scaffold → {event.status}</span>
      </div>
    )
  }
  if (event.kind === 'backend_plan') {
    return (
      <div className="flex gap-2 text-foreground/80">
        <span>~</span>
        <span>
          InsForge plan: {event.plan.tables.length} tables,{' '}
          {event.plan.storageBuckets.length} buckets,{' '}
          {event.plan.functions.length} functions
        </span>
      </div>
    )
  }
  if (event.kind === 'preview_url') {
    return (
      <div className="flex gap-2 text-foreground/80">
        <span>~</span>
        <span>
          {event.url
            ? `preview ready: ${event.url}`
            : 'preview unavailable until a managed project is created'}
        </span>
      </div>
    )
  }
  if (event.kind === 'done') {
    return (
      <div className="flex gap-2 text-emerald-600 dark:text-emerald-400">
        <span>✓</span>
        <span>build complete</span>
      </div>
    )
  }
  if (event.kind === 'error') {
    return (
      <div className="flex gap-2 text-rose-600 dark:text-rose-400">
        <span>!</span>
        <span>{event.message}</span>
      </div>
    )
  }
  return null
}

function phaseStatus(
  phaseKey: BrokBuildPhase,
  current: BrokBuildPhase
): 'done' | 'active' | 'pending' {
  if (current === 'failed') {
    return 'pending'
  }
  if (current === 'idle') return 'pending'
  if (current === 'ready' || current === phaseKey) {
    if (current === phaseKey) return 'active'
    return 'done'
  }
  const currentIdx = PHASE_ORDER.indexOf(current)
  const keyIdx = PHASE_ORDER.indexOf(phaseKey)
  if (currentIdx === -1 || keyIdx === -1) return 'pending'
  if (keyIdx < currentIdx) return 'done'
  if (keyIdx === currentIdx) return 'active'
  return 'pending'
}
