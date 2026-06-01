'use client'

import { useMemo } from 'react'

import { UseChatHelpers } from '@ai-sdk/react'
import { ChatRequestOptions } from 'ai'
import { toast } from 'sonner'

import { AnswerToolbar } from '@/components/search/answer-toolbar'
import {
  FollowUpSuggestions,
  type FollowUp
} from '@/components/search/follow-up-suggestions'
import { SourcesPanel, type SourceCardData } from '@/components/search/source-card'
import { StreamingProgress } from '@/components/search/streaming-progress'
import type { SearchResultItem } from '@/lib/types'
import type {
  UIDataTypes,
  UIMessage,
  UIMessageMetadata,
  UITools
} from '@/lib/types/ai'
import { useStreamingPhases } from '@/hooks/use-streaming-phases'
import { cn } from '@/lib/utils'

import { CollapsibleMessage } from '../collapsible-message'
import { MarkdownMessage } from '../message'

export interface SearchAnswerSectionProps {
  content: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  chatId?: string
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

function extractSources(
  citationMaps: Record<string, Record<number, SearchResultItem>> = {}
): SourceCardData[] {
  const seen = new Set<string>()
  const out: SourceCardData[] = []
  let order = 0
  for (const toolMap of Object.values(citationMaps)) {
    if (!toolMap) continue
    const sortedKeys = Object.keys(toolMap)
      .map(Number)
      .sort((a, b) => a - b)
    for (const k of sortedKeys) {
      const item = toolMap[k]
      if (!item || !item.url) continue
      if (seen.has(item.url)) continue
      seen.add(item.url)
      out.push({
        id: String(k),
        url: item.url,
        title: item.title,
        domain: safeHostname(item.url),
        snippet: item.content || item.snippet,
        publishedAt: formatDate(item.publishedDate || item.date)
      })
      order += 1
    }
  }
  return out
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

export function SearchAnswerSection({
  content,
  isOpen,
  onOpenChange,
  messageId,
  status,
  reload,
  citationMaps,
  isGuest = false,
  className
}: SearchAnswerSectionProps) {
  const sources = useMemo(() => extractSources(citationMaps), [citationMaps])
  const isStreaming = status === 'submitted' || status === 'streaming'
  const streaming = useStreamingPhases(isStreaming)

  const followUps = useMemo(
    () => (isStreaming ? [] : generateFollowUps(content)),
    [content, isStreaming]
  )

  const handleReload = () => {
    if (reload) return reload(messageId)
    return Promise.resolve(undefined)
  }

  const handleShare = async () => {
    const url =
      typeof window !== 'undefined' ? window.location.href : ''
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
      <div className={cn('flex flex-col gap-4', className)} data-testid="search-answer-section">
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
            <MarkdownMessage message={content} citationMaps={citationMaps} />
          </div>
        )}

        {!isStreaming && sources.length > 0 && (
          <SourcesPanel sources={sources} defaultExpanded={true} />
        )}

        {!isStreaming && content && (
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
      </div>
    </CollapsibleMessage>
  )
}
