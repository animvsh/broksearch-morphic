'use client'

/* eslint-disable react-hooks/set-state-in-effect -- typewriter uses setInterval callback */

import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

import { formatElapsed, useStreamingPhases } from '@/hooks/use-streaming-phases'

import { AnswerToolbar } from './answer-toolbar'
import { renderCitations } from './citation-marker'
import { type FollowUp, FollowUpSuggestions } from './follow-up-suggestions'
import { type SourceCardData, SourcesPanel } from './source-card'
import { StreamingProgress } from './streaming-progress'

interface SearchAnswerProps {
  query: string
  answer: string
  sources: SourceCardData[]
  followUps?: FollowUp[]
  isStreaming?: boolean
  onFollowUpSelect?: (fu: FollowUp) => void
  onShare?: () => void
  onRegenerate?: () => void
  onReadAloud?: () => void
  onTranslate?: (lang: string) => void
  className?: string
}

export function SearchAnswer({
  query,
  answer,
  sources,
  followUps = [],
  isStreaming = false,
  onFollowUpSelect,
  onShare,
  onRegenerate,
  onReadAloud,
  onTranslate,
  className
}: SearchAnswerProps) {
  const streaming = useStreamingPhases(isStreaming)
  const { state: streamingState, setSources, complete, reset } = streaming

  useEffect(() => {
    if (isStreaming) {
      setSources(sources.slice(0, 1))
    } else if (sources.length > 0) {
      setSources(sources)
      complete()
    }
  }, [complete, isStreaming, setSources, sources])

  return (
    <div className={cn('space-y-5', className)}>
      <QueryEcho query={query} />

      {isStreaming && (
        <StreamingProgress state={streamingState} onCancel={reset} />
      )}

      <AnswerBody text={answer} sources={sources} isStreaming={isStreaming} />

      {!isStreaming && sources.length > 0 && (
        <SourcesPanel sources={sources} defaultExpanded={true} />
      )}

      {!isStreaming && (
        <AnswerToolbar
          answerText={answer}
          onShare={onShare}
          onRegenerate={onRegenerate}
          onReadAloud={onReadAloud}
          onTranslate={onTranslate}
        />
      )}

      {!isStreaming && followUps.length > 0 && (
        <FollowUpSuggestions
          followUps={followUps}
          onSelect={onFollowUpSelect ?? (() => {})}
        />
      )}
    </div>
  )
}

function QueryEcho({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-foreground/[0.025] p-4">
      <p className="text-base leading-relaxed text-foreground/90">{query}</p>
    </div>
  )
}

interface AnswerBodyProps {
  text: string
  sources: SourceCardData[]
  isStreaming: boolean
}

function AnswerBody({ text, sources, isStreaming }: AnswerBodyProps) {
  const [displayed, setDisplayed] = useState(() => (isStreaming ? '' : text))

  useEffect(() => {
    if (!isStreaming) {
      setDisplayed(text)
      return
    }
    let i = 0
    const chunkSize = 4
    const interval = setInterval(() => {
      if (i === 0) setDisplayed('')
      i += chunkSize
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(interval)
    }, 16)
    return () => clearInterval(interval)
  }, [text, isStreaming])

  const parts = renderCitations(displayed, sources)
  const lastPart = parts[parts.length - 1]
  const isStillStreaming = isStreaming && displayed.length < text.length

  return (
    <div className="prose prose-zinc max-w-none dark:prose-invert">
      <p className="text-[15px] leading-7 text-foreground/90">
        {parts.map((part, idx) => (
          <span key={idx}>{part}</span>
        ))}
        {isStillStreaming && lastPart && typeof lastPart === 'string' && (
          <span className="streaming-caret" aria-hidden />
        )}
        {isStillStreaming && (typeof lastPart !== 'string' || !lastPart) && (
          <span className="streaming-caret" aria-hidden />
        )}
      </p>
    </div>
  )
}

export const DEMO_SOURCES: SourceCardData[] = [
  {
    id: '1',
    url: 'https://en.wikipedia.org/wiki/Fusion_power',
    title: 'Fusion power - Wikipedia',
    domain: 'en.wikipedia.org',
    snippet:
      'Fusion power is a proposed form of power generation that would generate electricity by using heat from nuclear fusion reactions. In a fusion process, two lighter atomic nuclei combine to form a heavier nucleus, while releasing energy.',
    relevanceScore: 0.95
  },
  {
    id: '2',
    url: 'https://www.iter.org/news',
    title: 'ITER — the way to new energy',
    domain: 'iter.org',
    snippet:
      "ITER is the world's largest tokamak, designed to prove the feasibility of fusion as a large-scale and carbon-free source of energy.",
    relevanceScore: 0.92
  },
  {
    id: '3',
    url: 'https://www.nature.com/articles/s41586-022-04881-w',
    title: 'Energy gain in inertial fusion: Latest results from NIF',
    domain: 'nature.com',
    snippet:
      'On December 5, 2022, a team at the National Ignition Facility achieved fusion ignition, releasing more energy from a target than was delivered to it.',
    relevanceScore: 0.88
  },
  {
    id: '4',
    url: 'https://cfs.energy',
    title: 'Commonwealth Fusion Systems',
    domain: 'cfs.energy',
    snippet:
      'Commonwealth Fusion Systems is building SPARC, a compact, high-field tokamak designed to achieve net energy from fusion, with first plasma targeted for 2026.',
    relevanceScore: 0.84,
    publishedAt: '2 days ago'
  }
]

export const DEMO_ANSWER = `Fusion energy has had a remarkable 18 months. The biggest headline came in late 2022 when the National Ignition Facility achieved ignition — a fusion reaction that released more energy than the laser input used to drive it [1]. That result has been replicated and refined several times since.

On the magnetic confinement side, ITER in France is now fully assembled and entering its first plasma phase, with first power-producing deuterium-tritium runs targeted for the late 2020s [2]. Private companies are racing ahead: Commonwealth Fusion Systems is building SPARC, a high-field tokamak that uses high-temperature superconducting magnets to dramatically shrink the device size, with first plasma scheduled for 2026 [3].

The pace has shifted from "30 years away" to genuinely feeling like a 2030s problem. The remaining hurdles are mostly engineering — tritium breeding, first-wall materials that survive 14 MeV neutron flux, and net-positive plasma operations at scale. None of these are trivial, but none of them appear to be showstoppers based on current research [1][3].`

export const DEMO_FOLLOW_UPS: FollowUp[] = [
  {
    id: 'fu-1',
    query: 'Compare the leading private fusion companies and their approaches',
    kind: 'compare'
  },
  {
    id: 'fu-2',
    query:
      'What specific materials challenges remain for the first wall of a fusion reactor?',
    kind: 'dive-deeper'
  },
  {
    id: 'fu-3',
    query: 'How do tokamaks differ from inertial confinement and stellarators?',
    kind: 'different-angle'
  },
  {
    id: 'fu-4',
    query: 'Latest news on fusion policy and government funding in 2026',
    kind: 'related'
  }
]

export { formatElapsed }
