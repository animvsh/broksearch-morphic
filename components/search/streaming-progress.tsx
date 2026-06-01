'use client'

import { useEffect, useState } from 'react'

import { BookOpen, Brain, Check, Loader2, Search, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatElapsed, type StreamingState } from '@/hooks/use-streaming-phases'

import type { SourcePreview } from '@/hooks/use-streaming-phases'

interface StreamingProgressProps {
  state: StreamingState
  onCancel?: () => void
  className?: string
}

export function StreamingProgress({
  state,
  onCancel,
  className
}: StreamingProgressProps) {
  if (state.phase === 'idle' || state.phase === 'complete') return null

  const isError = state.phase === 'error'
  const isReading = state.phase === 'reading'
  const isGathering = state.phase === 'gathering'
  const isSynthesizing = state.phase === 'synthesizing'

  return (
    <div
      className={cn(
        'rounded-xl border bg-card/60 p-4 backdrop-blur',
        isError ? 'border-destructive/30' : 'border-border/60',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <PhaseIcon phase={state.phase} />
          <PhaseLabel state={state} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatElapsed(state.elapsedMs)}
          </span>
          {onCancel && !isError && (
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors',
                'hover:bg-foreground/5 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label="Stop generating"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {(isReading || isGathering) && state.sources.length > 0 && (
        <SourceThumbStrip sources={state.sources} />
      )}

      {(isReading || isSynthesizing) && (
        <ProgressBar phase={state.phase} />
      )}

      {isError && state.error && (
        <p className="mt-2 text-xs text-destructive">{state.error}</p>
      )}
    </div>
  )
}

function PhaseIcon({ phase }: { phase: StreamingState['phase'] }) {
  if (phase === 'reading') {
    return (
      <div className="relative inline-flex size-7 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
        <div className="relative inline-flex size-7 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
          <Search className="size-3.5" />
        </div>
      </div>
    )
  }
  if (phase === 'gathering') {
    return (
      <div className="inline-flex size-7 items-center justify-center rounded-full bg-sky-500/10 text-sky-600">
        <Loader2 className="size-3.5 animate-spin" />
      </div>
    )
  }
  if (phase === 'synthesizing') {
    return (
      <div className="inline-flex size-7 items-center justify-center rounded-full bg-violet-500/10 text-violet-600">
        <Brain className="size-3.5 animate-pulse" />
      </div>
    )
  }
  if (phase === 'error') {
    return (
      <div className="inline-flex size-7 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <X className="size-3.5" />
      </div>
    )
  }
  return (
    <div className="inline-flex size-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
      <Check className="size-3.5" />
    </div>
  )
}

function PhaseLabel({ state }: { state: StreamingState }) {
  if (state.phase === 'reading') {
    return (
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Reading sources…</div>
        <div className="text-xs text-muted-foreground">
          Searching the web for relevant references
        </div>
      </div>
    )
  }
  if (state.phase === 'gathering') {
    return (
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          Found {state.sourceCount} {state.sourceCount === 1 ? 'source' : 'sources'}
        </div>
        <div className="text-xs text-muted-foreground">
          Gathering the most relevant references
        </div>
      </div>
    )
  }
  if (state.phase === 'synthesizing') {
    return (
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Synthesizing answer…</div>
        <div className="text-xs text-muted-foreground">
          Reading {state.sourceCount} {state.sourceCount === 1 ? 'source' : 'sources'} and composing a response
        </div>
      </div>
    )
  }
  if (state.phase === 'error') {
    return (
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-destructive">
          Something went wrong
        </div>
      </div>
    )
  }
  return null
}

function SourceThumbStrip({ sources }: { sources: SourcePreview[] }) {
  const shown = sources.slice(0, 8)
  const extra = sources.length - shown.length
  return (
    <div className="mt-3 flex items-center gap-1.5">
      {shown.map((s, idx) => (
        <div
          key={s.id}
          className="inline-flex size-6 items-center justify-center rounded-md border border-border/60 bg-background text-[10px] font-medium text-foreground/70"
          style={{ animation: `pop-in 250ms ease-out ${idx * 30}ms both` }}
          title={s.title}
        >
          {faviconLetter(s.domain)}
        </div>
      ))}
      {extra > 0 && (
        <div className="inline-flex h-6 items-center rounded-md border border-border/60 bg-background px-1.5 text-[10px] font-medium text-muted-foreground">
          +{extra}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ phase }: { phase: StreamingState['phase'] }) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (phase === 'reading') {
      setProgress(prev => Math.max(prev, 25))
      const t = setTimeout(() => setProgress(p => Math.max(p, 40)), 400)
      return () => clearTimeout(t)
    }
    if (phase === 'synthesizing') {
      setProgress(prev => Math.max(prev, 70))
      const t = setInterval(() => {
        setProgress(p => Math.min(p + 1, 92))
      }, 200)
      return () => clearInterval(t)
    }
  }, [phase])

  const color =
    phase === 'reading'
      ? 'bg-amber-500'
      : phase === 'synthesizing'
        ? 'bg-violet-500'
        : 'bg-foreground'

  return (
    <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-foreground/5">
      <div
        className={cn('h-full transition-all duration-500 ease-out', color)}
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

function faviconLetter(domain: string): string {
  if (!domain) return '?'
  const cleaned = domain.replace(/^www\./, '')
  return cleaned.charAt(0).toUpperCase()
}
