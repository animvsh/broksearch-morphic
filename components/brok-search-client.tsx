'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AlertCircle,
  ArrowUp,
  ExternalLink,
  Globe2,
  Info,
  Loader2,
  Sparkles
} from 'lucide-react'
import { toast } from 'sonner'

import type { SearchResultItem } from '@/lib/types'
import type { UIMessage } from '@/lib/types/ai'
import type { SearchMode } from '@/lib/types/search'

import { FollowUpChips, type FollowUpItem } from './follow-up-chips'
import { MarkdownMessage } from './message'
import { RelatedQuestionsPanel } from './related-questions-panel'
import { VoiceInputButton, VoiceOutputButton } from './voice-input-button'

interface Source {
  id: string
  title: string
  url: string
  publisher?: string
  snippet: string
  retrievedAt: string
  qualityScore?: number
}

interface SearchProgress {
  resolvedQuery?: string
  classification?: string
  searchQueries: string[]
  sources: Source[]
  status:
    | 'idle'
    | 'planning'
    | 'searching'
    | 'reading'
    | 'answering'
    | 'done'
    | 'error'
  message?: string
}

interface SearchTurn {
  id: string
  query: string
  answer: string
  sources: Source[]
  followUps: FollowUpItem[]
}

interface BrokSearchClientProps {
  initialQuery?: string
  initialMode?: SearchMode
  searchId?: string
  apiKey?: string
  apiBase?: string
  onFollowUpSelect?: (query: string) => void
}

const DEFAULT_API_BASE = '/api/search/session'
const GUEST_CHAT_STORAGE_PREFIX = 'brok:guest-chat:'

function getGuestChatStorageKey(chatId: string) {
  return `${GUEST_CHAT_STORAGE_PREFIX}${chatId}`
}

function toSearchResultItem(source: Source): SearchResultItem {
  return {
    title: source.title,
    url: source.url,
    content: source.snippet,
    snippet: source.snippet,
    publisher: source.publisher,
    retrievedAt: source.retrievedAt
  }
}

function getTurnMessageIds(searchId: string, turnIndex: number) {
  const suffix = turnIndex === 1 ? '' : `_${turnIndex}`
  return {
    userId: `${searchId}_user${suffix}`,
    assistantId: `${searchId}_assistant${suffix}`
  }
}

function toDurableMessagePair({
  answer,
  followUps,
  mode,
  query,
  searchId,
  sources,
  turnIndex
}: {
  answer: string
  followUps: FollowUpItem[]
  mode: SearchMode
  query: string
  searchId: string
  sources: Source[]
  turnIndex: number
}): UIMessage[] {
  const ids = getTurnMessageIds(searchId, turnIndex)
  return [
    {
      id: ids.userId,
      role: 'user',
      parts: [{ type: 'text', text: query }]
    },
    {
      id: ids.assistantId,
      role: 'assistant',
      parts: [{ type: 'text', text: answer }],
      metadata: {
        searchMode: mode,
        modelId: 'brok-session-search',
        answer: {
          sources: sources.map(toSearchResultItem),
          citationCount: sources.length,
          followUps: followUps.map((followUp, index) => ({
            id: `session-follow-up-${index + 1}`,
            label: followUp.label ?? followUp.query,
            query: followUp.query
          }))
        }
      }
    }
  ] as UIMessage[]
}

function persistDurableMessages(
  searchId: string | undefined,
  messages: UIMessage[]
) {
  if (!searchId || typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      getGuestChatStorageKey(searchId),
      JSON.stringify(messages)
    )
  } catch {
    // Local persistence is a reload convenience, not a reason to fail search.
  }
}

function commitDurableSearchUrl(searchId: string | undefined) {
  if (!searchId || typeof window === 'undefined') return
  if (window.location.pathname !== '/search') return
  window.history.replaceState({}, '', `/search/${searchId}`)
}

/**
 * Client for the Brok Search SSE endpoint. Renders the streaming answer,
 * source list, follow-up chips, and the related-questions panel as the
 * pipeline progresses. The component owns the streaming lifecycle and
 * surfaces a step-by-step progress UI while the search is running.
 */
export function BrokSearchClient({
  initialQuery,
  initialMode = 'quick',
  searchId,
  apiKey,
  apiBase,
  onFollowUpSelect
}: BrokSearchClientProps) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [followUpInput, setFollowUpInput] = useState('')
  const [activeQuestion, setActiveQuestion] = useState(initialQuery ?? '')
  const [completedTurns, setCompletedTurns] = useState<SearchTurn[]>([])
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([])
  const [progress, setProgress] = useState<SearchProgress>({
    searchQueries: [],
    sources: [],
    status: 'idle'
  })
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const durableMessagesRef = useRef<UIMessage[]>([])
  const activeTurnRef = useRef<SearchTurn | null>(null)

  const endpoint = useMemo(() => apiBase ?? DEFAULT_API_BASE, [apiBase])

  useEffect(() => {
    if (!activeQuestion.trim()) {
      activeTurnRef.current = null
      return
    }

    activeTurnRef.current = {
      id: `${searchId ?? 'search_session'}_turn_${Math.max(
        1,
        Math.ceil(durableMessagesRef.current.length / 2)
      )}`,
      query: activeQuestion,
      answer,
      sources: progress.sources,
      followUps
    }
  }, [activeQuestion, answer, followUps, progress.sources, searchId])

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim()
      if (!trimmed) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      commitDurableSearchUrl(searchId)

      const previousTurn = activeTurnRef.current
      if (previousTurn?.answer.trim()) {
        setCompletedTurns(prev =>
          prev.some(turn => turn.id === previousTurn.id)
            ? prev
            : [...prev, previousTurn]
        )
      }

      const durableSearchId = searchId ?? 'search_session'
      const turnIndex = Math.floor(durableMessagesRef.current.length / 2) + 1
      const turnId = `${durableSearchId}_turn_${turnIndex}`

      setActiveQuestion(trimmed)
      setPendingQuery(trimmed)
      setAnswer('')
      setFollowUps([])
      setError(null)
      setProgress({
        searchQueries: [],
        sources: [],
        status: 'planning',
        message: 'Planning search query...'
      })

      const writeDurableTurn = ({
        durableAnswer,
        durableFollowUps,
        durableSources
      }: {
        durableAnswer: string
        durableFollowUps: FollowUpItem[]
        durableSources: Source[]
      }) => {
        const pair = toDurableMessagePair({
          answer: durableAnswer,
          followUps: durableFollowUps,
          mode: initialMode,
          query: trimmed,
          searchId: durableSearchId,
          sources: durableSources,
          turnIndex
        })
        const nextMessages = [...durableMessagesRef.current]
        const baseIndex = (turnIndex - 1) * 2
        nextMessages[baseIndex] = pair[0]
        nextMessages[baseIndex + 1] = pair[1]
        durableMessagesRef.current = nextMessages
        persistDurableMessages(searchId, nextMessages)
      }

      writeDurableTurn({
        durableAnswer: '',
        durableFollowUps: [],
        durableSources: []
      })
      activeTurnRef.current = {
        id: turnId,
        query: trimmed,
        answer: '',
        sources: [],
        followUps: []
      }

      try {
        let streamedAnswer = ''
        let streamedSources: Source[] = []
        let streamedFollowUps: FollowUpItem[] = []

        const persistSnapshot = () => {
          writeDurableTurn({
            durableAnswer: streamedAnswer,
            durableFollowUps: streamedFollowUps,
            durableSources: streamedSources
          })
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({
            query: trimmed,
            mode: initialMode,
            stream: true
          }),
          signal: controller.signal
        })

        if (!response.ok || !response.body) {
          const message = `Search request failed (${response.status})`
          setError(message)
          setProgress(prev => ({ ...prev, status: 'error', message }))
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        const dispatch = (event: string, data: any) => {
          switch (event) {
            case 'status':
              setProgress(prev => ({
                ...prev,
                message: data.message ?? prev.message
              }))
              return
            case 'query':
              setProgress(prev => ({
                ...prev,
                resolvedQuery: data.resolved_query ?? data.query,
                classification: data.classification?.type,
                searchQueries: data.search_queries ?? prev.searchQueries,
                status: prev.status === 'planning' ? 'searching' : prev.status,
                message: prev.message ?? 'Searching sources...'
              }))
              return
            case 'query_resolved':
              setProgress(prev => ({
                ...prev,
                resolvedQuery: data.resolved_query,
                classification: data.classification?.type,
                searchQueries: data.search_queries ?? [],
                status: 'searching',
                message: 'Fetching and ranking sources...'
              }))
              return
            case 'search_started':
              setProgress(prev => ({
                ...prev,
                status: 'searching',
                message: `Running ${data.search_queries?.length ?? 0} searches...`
              }))
              return
            case 'source_found':
              if (!streamedSources.some(s => s.id === data.source.id)) {
                streamedSources = [...streamedSources, data.source as Source]
                persistSnapshot()
              }
              setProgress(prev => {
                if (prev.sources.some(s => s.id === data.source.id)) {
                  return prev
                }
                return {
                  ...prev,
                  sources: [...prev.sources, data.source as Source]
                }
              })
              return
            case 'source_read':
              setProgress(prev => ({
                ...prev,
                status: prev.status === 'searching' ? 'reading' : prev.status,
                message: 'Reading sources and compressing context...'
              }))
              return
            case 'answer_delta':
              streamedAnswer += data.delta ?? ''
              persistSnapshot()
              setAnswer(prev => prev + (data.delta ?? ''))
              setProgress(prev => ({
                ...prev,
                status: 'answering',
                message: 'Composing answer...'
              }))
              return
            case 'citation_added':
              // Citations are surfaced via source_found; nothing to do here.
              return
            case 'follow_ups_generated':
              streamedFollowUps = data.follow_ups ?? []
              persistSnapshot()
              setFollowUps(data.follow_ups ?? [])
              return
            case 'follow_ups':
              streamedFollowUps = data.items ?? data.follow_ups ?? []
              persistSnapshot()
              setFollowUps(streamedFollowUps)
              return
            case 'done':
              persistSnapshot()
              setProgress(prev => ({
                ...prev,
                status: 'done',
                message: 'Answer ready'
              }))
              return
            case 'search.error':
              setError(data?.error?.message ?? 'Search failed')
              setProgress(prev => ({
                ...prev,
                status: 'error',
                message: data?.error?.message ?? 'Search failed'
              }))
              return
            default:
              return
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let boundary: number
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const eventLines = rawEvent.split('\n')
            let eventName = 'message'
            const dataLines: string[] = []
            for (const line of eventLines) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim()
              else if (line.startsWith('data:'))
                dataLines.push(line.slice(5).trim())
            }
            const dataStr = dataLines.join('\n')
            if (dataStr === '[DONE]') continue
            if (!dataStr) continue
            try {
              const parsed = JSON.parse(dataStr)
              dispatch(eventName, parsed)
            } catch (err) {
              console.warn('Failed to parse SSE payload', err, dataStr)
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        console.error('Search failed:', err)
        const message =
          err instanceof Error ? err.message : 'Search could not complete'
        setError(message)
        setProgress(prev => ({ ...prev, status: 'error', message }))
      } finally {
        setPendingQuery(null)
      }
    },
    [endpoint, apiKey, initialMode, searchId]
  )

  useEffect(() => {
    if (initialQuery && initialQuery.trim().length > 0) {
      void runSearch(initialQuery)
    }
    return () => {
      abortRef.current?.abort()
    }
  }, [initialQuery, runSearch])

  const handleFollowUp = useCallback(
    (next: string) => {
      if (onFollowUpSelect) {
        onFollowUpSelect(next)
      } else {
        setQuery(next)
        void runSearch(next)
      }
    },
    [onFollowUpSelect, runSearch]
  )

  const submitFollowUp = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = followUpInput.trim()
      if (!trimmed) return
      setFollowUpInput('')
      setQuery(trimmed)
      handleFollowUp(trimmed)
    },
    [followUpInput, handleFollowUp]
  )

  const handleVoiceTranscript = useCallback((text: string) => {
    setQuery(text)
  }, [])

  const isLoading =
    progress.status === 'planning' ||
    progress.status === 'searching' ||
    progress.status === 'reading' ||
    progress.status === 'answering'

  return (
    <div className="flex w-full gap-6">
      <section
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-12 pt-8 sm:px-6"
        data-testid="brok-search-client"
      >
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" />
            <span>Brok Search</span>
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={event => {
              event.preventDefault()
              void runSearch(query)
            }}
          >
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Ask anything..."
              className="flex-1 rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 text-sm shadow-[0_8px_24px_-18px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
            />
            <VoiceInputButton onTranscript={handleVoiceTranscript} />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-zinc-950 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                'Search'
              )}
            </button>
          </form>
        </header>

        {error && (
          <div
            className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700"
            role="alert"
            data-testid="brok-search-error"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {completedTurns.map(turn => (
          <CompletedTurn key={turn.id} turn={turn} />
        ))}

        {activeQuestion && (
          <div
            className="ml-auto max-w-[85%] rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.35)]"
            data-testid="brok-search-question"
          >
            {activeQuestion}
          </div>
        )}

        {isLoading && <SearchProgressIndicator progress={progress} />}

        {progress.sources.length > 0 && (
          <SourceList sources={progress.sources} />
        )}

        {isLoading && !answer && <AnswerLoadingCard />}

        {answer && (
          <article
            className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-5 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.28)]"
            data-testid="brok-search-answer"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="inline-flex items-center gap-2">
                <Globe2 className="size-3.5" />
                <span>
                  {progress.sources.length} sources
                  {progress.classification
                    ? ` • ${progress.classification.replace(/\//g, ' ')}`
                    : ''}
                </span>
              </div>
              <VoiceOutputButton text={answer} />
            </div>
            <MarkdownMessage message={answer} />
            {progress.status === 'done' && progress.sources.length === 0 && (
              <NoSourcesNotice />
            )}
          </article>
        )}

        {progress.status === 'done' && (
          <FollowUpChips
            followUps={followUps}
            onSelect={handleFollowUp}
            disabled={isLoading}
            isLoading={isLoading}
          />
        )}

        {pendingQuery && progress.status === 'planning' && (
          <p className="text-xs text-muted-foreground">
            Searching for: {pendingQuery}
          </p>
        )}

        {(answer || completedTurns.length > 0 || isLoading) && (
          <form
            className="sticky bottom-3 mt-2 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-2 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.35)] backdrop-blur"
            data-testid="brok-follow-up-form"
            onSubmit={submitFollowUp}
          >
            <input
              value={followUpInput}
              onChange={event => setFollowUpInput(event.target.value)}
              placeholder="Ask a follow-up..."
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none"
              aria-label="Ask a follow-up"
            />
            <button
              type="submit"
              disabled={isLoading || !followUpInput.trim()}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send follow-up"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </button>
          </form>
        )}
      </section>

      <RelatedQuestionsPanel
        followUps={followUps}
        onSelect={handleFollowUp}
        isLoading={isLoading}
      />
    </div>
  )
}

function AnswerLoadingCard() {
  return (
    <article
      className="rounded-2xl border border-zinc-200 bg-white/85 p-5 shadow-[0_18px_54px_-42px_rgba(15,23,42,0.26)]"
      aria-label="Preparing answer"
      data-testid="brok-answer-loading-card"
    >
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        <span>Preparing answer</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-3 w-11/12 animate-pulse rounded-full bg-zinc-100" />
        <div className="h-3 w-10/12 animate-pulse rounded-full bg-zinc-100" />
        <div className="h-3 w-7/12 animate-pulse rounded-full bg-zinc-100" />
      </div>
    </article>
  )
}

function NoSourcesNotice() {
  return (
    <div
      className="mt-3 flex items-start gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-xs leading-5 text-zinc-600"
      data-testid="brok-no-sources-notice"
    >
      <Info className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
      <span>
        No web sources were attached to this answer. Treat it as model knowledge
        and verify important details before relying on it.
      </span>
    </div>
  )
}

function CompletedTurn({ turn }: { turn: SearchTurn }) {
  return (
    <section
      className="flex flex-col gap-3 border-b border-zinc-200/70 pb-5"
      data-testid="completed-search-turn"
    >
      <div className="ml-auto max-w-[85%] rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900">
        {turn.query}
      </div>
      {turn.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Previous sources">
          {turn.sources.slice(0, 4).map((source, index) => (
            <a
              key={`${turn.id}-${source.id}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-[12rem] items-center gap-1 rounded-full border border-zinc-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-950"
            >
              <span className="shrink-0">[{index + 1}]</span>
              <span className="truncate">
                {source.publisher ?? safeHostname(source.url)}
              </span>
            </a>
          ))}
        </div>
      )}
      <article className="rounded-2xl border border-zinc-200 bg-white/80 p-4 text-sm text-zinc-900">
        <MarkdownMessage message={turn.answer} />
      </article>
    </section>
  )
}

function SearchProgressIndicator({ progress }: { progress: SearchProgress }) {
  const steps = [
    { id: 'planning', label: 'Resolving query' },
    { id: 'searching', label: 'Running searches' },
    { id: 'reading', label: 'Reading sources' },
    { id: 'answering', label: 'Composing answer' }
  ] as const

  const order = steps.map(step => step.id)
  const activeIndex = order.indexOf(progress.status as (typeof order)[number])

  return (
    <div
      className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-[0_18px_44px_-32px_rgba(15,23,42,0.18)]"
      data-testid="search-progress"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>{progress.message ?? 'Working on it...'}</span>
        </div>
        <ol className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-4">
          {steps.map((step, index) => {
            const isActive = index === activeIndex
            const isDone = activeIndex > index
            return (
              <li
                key={step.id}
                className={
                  isActive
                    ? 'font-medium text-zinc-900'
                    : isDone
                      ? 'text-zinc-600'
                      : 'text-muted-foreground/70'
                }
              >
                <span className="mr-1">{index + 1}.</span>
                {step.label}
              </li>
            )
          })}
        </ol>
        {progress.searchQueries.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            {progress.searchQueries.map((q, index) => (
              <li
                key={`${q}-${index}`}
                className="rounded-full bg-zinc-100 px-2 py-0.5"
              >
                {q}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null
  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-[0_18px_44px_-32px_rgba(15,23,42,0.18)]"
      data-testid="brok-search-sources"
    >
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sources
      </h2>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {sources.map((source, index) => (
          <li
            key={source.id}
            className="flex flex-col gap-1 rounded-xl border border-zinc-200/70 bg-white/90 p-3"
            data-testid={`brok-search-source-${index}`}
          >
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:underline"
            >
              <span className="line-clamp-1">
                [{index + 1}] {source.title}
              </span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
            <span className="text-[11px] text-muted-foreground">
              {source.publisher ?? safeHostname(source.url)}
            </span>
            {source.snippet && (
              <p className="line-clamp-3 text-[12px] text-zinc-600">
                {source.snippet}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
