'use client'

import { useMemo, useState } from 'react'

import { UseChatHelpers } from '@ai-sdk/react'
import { ChatRequestOptions } from 'ai'
import { Info } from 'lucide-react'
import { toast } from 'sonner'

import { extractFollowUpsFromText } from '@/lib/render/follow-ups'
import type { SearchResultItem } from '@/lib/types'
import type {
  UIDataTypes,
  UIMessage,
  UIMessageMetadata,
  UITools
} from '@/lib/types/ai'
import { cn } from '@/lib/utils'

import { useStreamingPhases } from '@/hooks/use-streaming-phases'

import { AnswerToolbar } from '@/components/search/answer-toolbar'
import {
  type FollowUp,
  FollowUpSuggestions
} from '@/components/search/follow-up-suggestions'
import {
  type SourceCardData,
  SourcesPanel
} from '@/components/search/source-card'
import { SourceSidePanel } from '@/components/search/source-side-panel'
import { StreamingProgress } from '@/components/search/streaming-progress'

import { CollapsibleMessage } from '../collapsible-message'
import { MarkdownMessage } from '../message'

export interface SearchAnswerSectionProps {
  content: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  chatId?: string
  onFollowUpSubmit?: (query: string) => void
  showActions?: boolean
  messageId: string
  metadata?: UIMessageMetadata
  status?: UseChatHelpers<UIMessage<unknown, UIDataTypes, UITools>>['status']
  reload?: (
    messageId: string,
    options?: ChatRequestOptions
  ) => Promise<void | string | null | undefined>
  citationMaps?: Record<string, Record<number, SearchResultItem>>
  isGuest?: boolean
  className?: string
}

export function extractSources(
  citationMaps: Record<string, Record<number, SearchResultItem>> = {}
): SourceCardData[] {
  const seen = new Set<string>()
  const out: SourceCardData[] = []
  for (const [toolCallId, toolMap] of Object.entries(citationMaps)) {
    if (!toolMap) continue
    const sortedKeys = Object.keys(toolMap)
      .map(Number)
      .sort((a, b) => a - b)
    for (const k of sortedKeys) {
      const item = toolMap[k]
      if (!item || !item.url) continue
      const sourceKey = normalizeSourceKey(item.url)
      if (seen.has(sourceKey)) continue
      seen.add(sourceKey)
      out.push({
        id: `${toolCallId}:${k}`,
        url: item.url,
        title: item.title,
        domain: safeHostname(item.url),
        snippet: item.content || item.snippet,
        publishedAt: formatDate(item.publishedDate || item.date)
      })
    }
  }
  return out
}

function extractSourcesFromItems(
  sources: SearchResultItem[],
  toolCallId = 'answer'
): SourceCardData[] {
  const seen = new Set<string>()
  const out: SourceCardData[] = []

  sources.forEach((item, index) => {
    if (!item?.url) return
    const sourceKey = normalizeSourceKey(item.url)
    if (seen.has(sourceKey)) return
    seen.add(sourceKey)
    out.push({
      id: `${toolCallId}:${index + 1}`,
      url: item.url,
      title: item.title,
      domain: safeHostname(item.url),
      snippet: item.content || item.snippet,
      publishedAt: formatDate(item.publishedDate || item.date)
    })
  })

  return out
}

function normalizeSourceKey(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/^utm_/i.test(key) || key === 'ref' || key === 'fbclid') {
        parsed.searchParams.delete(key)
      }
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return url.trim()
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'unknown'
  }
}

function formatDate(input?: string | Date): string | undefined {
  if (!input) return undefined
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function generateFollowUps(content: string): FollowUp[] {
  const trimmed = getFollowUpTopicSource(content)
  if (!trimmed) return []
  const topic = trimmed.split(/[.!?\n]/)[0].slice(0, 80) || 'this topic'
  return [
    {
      id: 'fu-deep',
      kind: 'dive-deeper',
      query: `Go deeper on the most surprising point in your last answer`
    },
    {
      id: 'fu-angle',
      kind: 'different-angle',
      query: `What would a skeptic say about: ${topic}?`
    },
    {
      id: 'fu-related',
      kind: 'related',
      query: `What's adjacent to "${topic}" that I should know?`
    },
    {
      id: 'fu-compare',
      kind: 'compare',
      query: `Compare the strongest and weakest parts of that answer`
    }
  ]
}

function stripThinkingText(content: string): string {
  const withoutClosedThinking = content.replace(
    /<think\b[^>]*>[\s\S]*?<\/think>/gi,
    ''
  )

  return withoutClosedThinking.replace(/<think\b[^>]*>[\s\S]*$/gi, '').trim()
}

function getFollowUpTopicSource(content: string): string {
  return stripThinkingText(content)
    .replace(/```spec[\s\S]*?```/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getMetadataSources(
  metadata?: UIMessageMetadata
): SearchResultItem[] | undefined {
  return Array.isArray(metadata?.answer?.sources)
    ? metadata.answer.sources
    : undefined
}

function getMetadataFollowUps(metadata?: UIMessageMetadata): FollowUp[] {
  if (!Array.isArray(metadata?.answer?.followUps)) return []

  return metadata.answer.followUps
    .filter(
      followUp =>
        typeof followUp?.query === 'string' && followUp.query.trim().length > 0
    )
    .map((followUp, index) => ({
      id: followUp.id || `metadata-follow-up-${index + 1}`,
      kind: 'related' as const,
      query: followUp.query.trim()
    }))
}

export function SearchAnswerSection({
  content,
  isOpen,
  onOpenChange,
  messageId,
  metadata,
  status,
  reload,
  citationMaps,
  onFollowUpSubmit,
  isGuest = false,
  showActions = true,
  className
}: SearchAnswerSectionProps) {
  const metadataSources = useMemo(
    () => getMetadataSources(metadata),
    [metadata]
  )
  const sources = useMemo(
    () =>
      metadataSources && metadataSources.length > 0
        ? extractSourcesFromItems(metadataSources)
        : extractSources(citationMaps),
    [citationMaps, metadataSources]
  )
  const isStreaming = status === 'submitted' || status === 'streaming'
  const streaming = useStreamingPhases(isStreaming)
  const streamingSources = useMemo(
    () =>
      sources.map(source => ({
        id: source.id,
        title: source.title,
        url: source.url,
        domain: source.domain,
        snippet: source.snippet
      })),
    [sources]
  )
  const streamingPhase = content.trim()
    ? 'synthesizing'
    : sources.length > 0
      ? 'gathering'
      : 'reading'
  const displayContent = useMemo(() => stripThinkingText(content), [content])
  const [activeSource, setActiveSource] = useState<
    SearchResultItem | SourceCardData | null
  >(null)
  const generatedFollowUps = useMemo(
    () => extractFollowUpsFromText(displayContent, messageId),
    [displayContent, messageId]
  )
  const metadataFollowUps = useMemo(
    () => getMetadataFollowUps(metadata),
    [metadata]
  )

  const followUps = useMemo(
    () =>
      isStreaming || generatedFollowUps.length > 0
        ? []
        : metadataFollowUps.length > 0
          ? metadataFollowUps
          : generateFollowUps(displayContent),
    [displayContent, generatedFollowUps.length, isStreaming, metadataFollowUps]
  )

  const handleReload = () => {
    if (reload) return reload(messageId)
    return Promise.resolve(undefined)
  }

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    try {
      if (url && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied to clipboard')
      } else {
        toast.error('Cannot copy in this environment')
      }
    } catch {
      toast.error('Copy failed')
    }
  }

  const handleReadAloud = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast.error('Read aloud not supported')
      return
    }
    const synth = window.speechSynthesis
    synth.cancel()
    const utter = new SpeechSynthesisUtterance(displayContent)
    synth.speak(utter)
  }

  const handleTranslate = (lang: string) => {
    toast.info(`Translation to ${lang} would run server-side here.`)
  }

  const handleFollowUp = (fu: FollowUp) => {
    if (onFollowUpSubmit) {
      onFollowUpSubmit(fu.query)
      return
    }

    if (typeof window === 'undefined') return
    const input = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="input"]'
    )
    if (input) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      )?.set
      nativeInputValueSetter?.call(input, fu.query)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.focus()
    } else {
      toast.info(fu.query)
    }
  }

  return (
    <CollapsibleMessage
      role="assistant"
      isCollapsible={false}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      showBorder={false}
      showIcon={false}
    >
      <div
        className={cn('flex flex-col gap-4', className)}
        data-testid="search-answer-section"
      >
        {isStreaming && (
          <StreamingProgress
            state={{
              phase: streamingPhase,
              sourceCount: sources.length,
              sources: streamingSources,
              elapsedMs: streaming.state.elapsedMs,
              startedAt: streaming.state.startedAt,
              error: null
            }}
          />
        )}

        {isStreaming && sources.length === 0 && <SourceSkeletonStrip />}

        {sources.length > 0 && (
          <SourcesPanel
            sources={sources}
            defaultExpanded={false}
            onOpenSource={setActiveSource}
          />
        )}

        {displayContent ? (
          <div className="flex flex-col gap-1" data-testid="answer-section">
            <MarkdownMessage
              message={displayContent}
              citationMaps={citationMaps}
              onCitationOpen={setActiveSource}
            />
          </div>
        ) : isStreaming ? (
          <AnswerSkeleton />
        ) : null}

        {!isStreaming && displayContent && sources.length === 0 && (
          <KnowledgeFallbackNotice />
        )}

        {!isStreaming && displayContent && showActions && (
          <div className="flex flex-col gap-4">
            <AnswerToolbar
              answerText={displayContent}
              onShare={handleShare}
              onRegenerate={handleReload}
              onReadAloud={handleReadAloud}
              onTranslate={handleTranslate}
            />
            {followUps.length > 0 && (
              <FollowUpSuggestions
                followUps={followUps}
                onSelect={handleFollowUp}
              />
            )}
          </div>
        )}

        <SourceSidePanel
          source={activeSource}
          open={Boolean(activeSource)}
          onOpenChange={open => {
            if (!open) setActiveSource(null)
          }}
        />
      </div>
    </CollapsibleMessage>
  )
}

function KnowledgeFallbackNotice() {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/35 px-3 py-2 text-xs leading-5 text-muted-foreground"
      data-testid="knowledge-fallback-notice"
    >
      <Info className="mt-0.5 size-3.5 shrink-0 text-foreground/55" />
      <span>
        No web sources were attached to this answer. Treat it as model knowledge
        and verify important details before relying on it.
      </span>
    </div>
  )
}

function SourceSkeletonStrip() {
  return (
    <div
      className="flex items-center gap-2 overflow-hidden"
      aria-label="Loading sources"
      data-testid="source-skeleton-strip"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="flex h-9 w-28 shrink-0 animate-pulse items-center gap-2 rounded-lg border border-border/60 bg-muted/45 px-2.5"
          data-testid="source-skeleton"
        >
          <span className="size-4 rounded-full bg-background/80" />
          <span className="h-2 w-14 rounded-full bg-background/80" />
        </div>
      ))}
    </div>
  )
}

function AnswerSkeleton() {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background/60 p-4 shadow-sm"
      aria-label="Writing answer"
      data-testid="answer-skeleton"
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-violet-500/70" />
        Drafting the answer as sources arrive
      </div>
      <div className="h-3 w-11/12 animate-pulse rounded-full bg-muted" />
      <div className="h-3 w-10/12 animate-pulse rounded-full bg-muted" />
      <div className="h-3 w-8/12 animate-pulse rounded-full bg-muted" />
    </div>
  )
}
