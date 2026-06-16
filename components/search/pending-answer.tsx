'use client'

import { useStreamingPhases } from '@/hooks/use-streaming-phases'

import { StreamingProgress } from '@/components/search/streaming-progress'

const PENDING_STEPS = [
  { label: 'Search', state: 'active' },
  { label: 'Read', state: 'waiting' },
  { label: 'Write', state: 'waiting' }
] as const

export function PendingAnswer() {
  const streaming = useStreamingPhases(true)

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="pending-answer"
      aria-label="Preparing answer"
    >
      <div className="flex items-center gap-1.5 overflow-hidden">
        {PENDING_STEPS.map((step, index) => (
          <div
            key={step.label}
            className="flex min-w-0 items-center gap-1.5"
            data-testid={`pending-step-${step.label.toLowerCase()}`}
          >
            <span
              className={[
                'inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium transition-colors',
                step.state === 'active'
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-border/60 bg-muted/35 text-muted-foreground'
              ].join(' ')}
            >
              {step.label}
            </span>
            {index < PENDING_STEPS.length - 1 && (
              <span className="h-px w-4 shrink-0 bg-border/70" />
            )}
          </div>
        ))}
      </div>
      <StreamingProgress
        state={{
          phase: 'reading',
          sourceCount: 0,
          sources: [],
          elapsedMs: streaming.state.elapsedMs,
          startedAt: streaming.state.startedAt,
          error: null
        }}
      />
      <div
        className="flex items-center gap-2 overflow-hidden"
        aria-label="Loading source cards"
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex h-9 w-28 shrink-0 animate-pulse items-center gap-2 rounded-lg border border-border/60 bg-muted/45 px-2.5"
          >
            <span className="size-4 rounded-full bg-background/80" />
            <span className="h-2 w-14 rounded-full bg-background/80" />
          </div>
        ))}
      </div>
      <div
        className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background/60 p-4 shadow-sm"
        aria-label="Writing answer"
      >
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-violet-500/70" />
          Drafting the answer as sources arrive
        </div>
        <div className="h-3 w-11/12 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-10/12 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-8/12 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  )
}
