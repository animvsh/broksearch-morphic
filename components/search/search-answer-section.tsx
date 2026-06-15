'use client'

import { useMemo, useState } from 'react'

import { UseChatHelpers } from '@ai-sdk/react'
import { ChatRequestOptions } from 'ai'
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
  const trimmed = content.trim()
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
  const [activeSource, setActiveSource] = useState<
    SearchResultItem | SourceCardData | null
  >(null)
  const generatedFollowUps = useMemo(
    () => extractFollowUpsFromText(content, messageId),
    [content, messageId]
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
          : generateFollowUps(content),
    [content, generatedFollowUps.length, isStreaming, metadataFollowUps]
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
    const utter = new SpeechSynthesisUtterance(content)
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
        {isStreaming && sources.length === 0 && (
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
        )}

        {content && (
          <div className="flex flex-col gap-1" data-testid="answer-section">
            <MarkdownMessage
              message={content}
              citationMaps={citationMaps}
              onCitationOpen={setActiveSource}
            />
          </div>
        )}

        {!isStreaming && sources.length > 0 && (
          <SourcesPanel
            sources={sources}
            defaultExpanded={true}
            onOpenSource={setActiveSource}
          />
        )}

        {!isStreaming && content && showActions && (
          <div className="flex flex-col gap-4">
            <AnswerToolbar
              answerText={content}
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
