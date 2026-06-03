'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  AlertCircle,
  ExternalLink,
  Globe2,
  Loader2,
  Sparkles
} from 'lucide-react'
import { toast } from 'sonner'

import { FollowUpChips, type FollowUpItem } from './follow-up-chips'
import { MarkdownMessage } from './message'
import { RelatedQuestionsPanel } from './related-questions-panel'
import {
  VoiceInputButton,
  VoiceOutputButton
} from './voice-input-button'

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
  status: 'idle' | 'planning' | 'searching' | 'reading' | 'answering' | 'done' | 'error'
  message?: string
}

interface BrokSearchClientProps {
  initialQuery?: string
  apiKey?: string
  apiBase?: string
  onFollowUpSelect?: (query: string) => void
}

const DEFAULT_API_BASE = '/api/v1/search/completions'

/**
 * Client for the Brok Search SSE endpoint. Renders the streaming answer,
 * source list, follow-up chips, and the related-questions panel as the
 * pipeline progresses. The component owns the streaming lifecycle and
 * surfaces a step-by-step progress UI while the search is running.
 */
export function BrokSearchClient({
  initialQuery,
  apiKey,
  apiBase,
  onFollowUpSelect
}: BrokSearchClientProps) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery ?? '')
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

  const endpoint = useMemo(() => apiBase ?? DEFAULT_API_BASE, [apiBase])

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim()
      if (!trimmed) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

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

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({ query: trimmed, stream: true }),
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
              setFollowUps(data.follow_ups ?? [])
              return
            case 'done':
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
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
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
    [endpoint, apiKey]
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

        {isLoading && (
          <SearchProgressIndicator progress={progress} />
        )}

        {progress.sources.length > 0 && (
          <SourceList sources={progress.sources} />
        )}

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
          <p className="text-xs text-muted-foreground">Searching for: {pendingQuery}</p>
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
