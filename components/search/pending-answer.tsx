'use client'

import { useStreamingPhases } from '@/hooks/use-streaming-phases'

import { StreamingProgress } from '@/components/search/streaming-progress'

export function PendingAnswer() {
  const streaming = useStreamingPhases(true)

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="pending-answer"
      aria-label="Preparing answer"
    >
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
            className="h-9 w-28 shrink-0 animate-pulse rounded-lg border border-border/60 bg-muted/55"
          />
        ))}
      </div>
      <div
        className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background/60 p-4"
        aria-label="Writing answer"
      >
        <div className="h-3 w-11/12 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-10/12 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-8/12 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  )
}
