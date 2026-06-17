'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AlertCircle,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe2,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Square
} from 'lucide-react'
import { toast } from 'sonner'

import type { SearchResultItem } from '@/lib/types'
import type { UIMessage } from '@/lib/types/ai'
import type { ModelSelectorData } from '@/lib/types/model-selector'
import type { SearchMode } from '@/lib/types/search'
import { safeCopyTextToClipboard } from '@/lib/utils/copy-to-clipboard'

import { recordRecentSearch } from './search/recent-searches'
import { SourceSidePanel } from './search/source-side-panel'
import { FollowUpChips, type FollowUpItem } from './follow-up-chips'
import { MarkdownMessage } from './message'
import { ModelSelectorClient } from './model-selector-client'
import { RelatedQuestionsPanel } from './related-questions-panel'
import { VoiceInputButton, VoiceOutputButton } from './voice-input-button'

interface Source {
  id?: string
  title: string
  url: string
  publisher?: string
  snippet: string
  retrievedAt: string
  qualityScore?: number
}

interface SearchProgress {
  answerModel?: {
    id: string
    name: string
    providerId: string
  } | null
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

interface SearchContextTurn {
  query: string
  answer: string
}

type StoredAnswerMetadata = {
  answer?: {
    sources?: SearchResultItem[]
    followUps?: Array<{
      id?: string
      label?: string
      query: string
    }>
  }
}

interface BrokSearchClientProps {
  initialQuery?: string
  initialMode?: SearchMode
  searchId?: string
  apiKey?: string
  apiBase?: string
  onFollowUpSelect?: (query: string) => void
  persistToServer?: boolean
  modelSelectorData?: ModelSelectorData
}

const DEFAULT_API_BASE = '/api/search/session'
const GUEST_CHAT_STORAGE_PREFIX = 'brok:guest-chat:'
const SESSION_CITATION_TOOL_ID = 'brok-session-search'

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

function getSourceIdentity(source: Source) {
  return source.id ?? source.url ?? `${source.title}:${source.publisher ?? ''}`
}

function isLocalFallbackSource(source: Source) {
  return (
    source.id === 'fallback_local_1' ||
    source.publisher === 'Brok local fallback' ||
    source.url.includes('#local-fallback')
  )
}

function hasOnlyLocalFallbackSources(sources: Source[]) {
  return sources.length > 0 && sources.every(isLocalFallbackSource)
}

function buildCitationMaps(
  sources: Source[]
): Record<string, Record<number, SearchResultItem>> {
  if (sources.length === 0) return {}

  return {
    [SESSION_CITATION_TOOL_ID]: sources.reduce<
      Record<number, SearchResultItem>
    >((acc, source, index) => {
      acc[index + 1] = toSearchResultItem(source)
      return acc
    }, {})
  }
}

function linkPlainCitations(message: string, sources: Source[]) {
  if (sources.length === 0) return message

  return message.replace(/\[(\d+)\](?!\()/g, (match, rawNumber) => {
    const citationNumber = Number.parseInt(rawNumber, 10)
    if (
      !Number.isFinite(citationNumber) ||
      citationNumber < 1 ||
      citationNumber > sources.length
    ) {
      return match
    }

    return `[${citationNumber}](#${SESSION_CITATION_TOOL_ID}:${citationNumber})`
  })
}

function buildFallbackFollowUps(query: string, answer: string): FollowUpItem[] {
  const topic =
    query.trim() ||
    answer
      .replace(/\s+/g, ' ')
      .split(/[.!?\n]/)[0]
      .slice(0, 80)
      .trim() ||
    'this answer'

  return [
    {
      label: 'Go deeper',
      query: `Go deeper on ${topic}`
    },
    {
      label: 'Compare tradeoffs',
      query: `Compare the strongest and weakest parts of ${topic}`
    },
    {
      label: 'Find risks',
      query: `What are the risks and edge cases for ${topic}?`
    }
  ]
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

function getTextPart(message: UIMessage | undefined) {
  if (!message?.parts) return ''

  return message.parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part?.type === 'text' &&
        typeof (part as { text?: unknown }).text === 'string'
    )
    .map(part => part.text)
    .join('')
}

function toSourceFromSearchResult(
  source: SearchResultItem,
  index: number
): Source {
  return {
    id: source.url || `stored-source-${index + 1}`,
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    snippet: source.snippet ?? source.content ?? '',
    retrievedAt:
      typeof source.retrievedAt === 'string'
        ? source.retrievedAt
        : new Date().toISOString()
  }
}

function readStoredSearchMessages(searchId: string | undefined): UIMessage[] {
  if (!searchId || typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(getGuestChatStorageKey(searchId))
    if (!raw) return []

    const messages = JSON.parse(raw) as UIMessage[]
    if (!Array.isArray(messages)) return []
    return messages
  } catch {
    return []
  }
}

function toStoredSearchTurns(searchId: string, messages: UIMessage[]) {
  const turns: SearchTurn[] = []
  for (let index = 0; index < messages.length; index += 2) {
    const userMessage = messages[index]
    const assistantMessage = messages[index + 1]
    if (
      userMessage?.role !== 'user' ||
      assistantMessage?.role !== 'assistant'
    ) {
      continue
    }

    const query = getTextPart(userMessage).trim()
    const answer = getTextPart(assistantMessage).trim()
    if (!query || !answer) continue

    const answerMetadata = (
      assistantMessage.metadata as StoredAnswerMetadata | undefined
    )?.answer
    const sources = Array.isArray(answerMetadata?.sources)
      ? answerMetadata.sources.map(toSourceFromSearchResult)
      : []
    const followUps = Array.isArray(answerMetadata?.followUps)
      ? answerMetadata.followUps
          .filter(
            followUp =>
              followUp &&
              typeof followUp.query === 'string' &&
              followUp.query.trim()
          )
          .map((followUp, followUpIndex) => ({
            label: followUp.label ?? followUp.query,
            query: followUp.query,
            id: followUp.id ?? `stored-follow-up-${followUpIndex + 1}`
          }))
      : []

    turns.push({
      id: `${searchId}_turn_${turns.length + 1}`,
      query,
      answer,
      sources,
      followUps
    })
  }

  return turns
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

function persistDurableMessagesToServer(
  searchId: string | undefined,
  messages: UIMessage[]
) {
  if (!searchId || !searchId.startsWith('search_') || messages.length === 0) {
    return
  }
  const hasAssistantAnswer = messages.some(
    message => message.role === 'assistant' && getTextPart(message).trim()
  )
  if (!hasAssistantAnswer) return

  Promise.resolve(
    fetch(`/api/search/session/${encodeURIComponent(searchId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    })
  ).catch(() => {
    // Local persistence remains the fast/offline fallback when server save fails.
  })
}

function commitDurableSearchUrl(searchId: string | undefined) {
  if (!searchId || typeof window === 'undefined') return
  if (window.location.pathname !== '/search') return
  window.history.replaceState({}, '', `/search/${searchId}`)
}

function compactSearchContext(turns: SearchTurn[]): SearchContextTurn[] {
  return turns
    .filter(turn => turn.query.trim() && turn.answer.trim())
    .slice(-3)
    .map(turn => ({
      query: turn.query.trim().slice(0, 240),
      answer: turn.answer.replace(/\s+/g, ' ').trim().slice(0, 900)
    }))
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
  onFollowUpSelect,
  persistToServer = true,
  modelSelectorData
}: BrokSearchClientProps) {
  const initialQueryText = initialQuery?.trim() ?? ''
  const [query, setQuery] = useState(initialQuery ?? '')
  const [followUpInput, setFollowUpInput] = useState('')
  const [activeQuestion, setActiveQuestion] = useState(initialQueryText)
  const [completedTurns, setCompletedTurns] = useState<SearchTurn[]>([])
  const [pendingQuery, setPendingQuery] = useState<string | null>(
    initialQueryText || null
  )
  const [answer, setAnswer] = useState('')
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([])
  const [activeSource, setActiveSource] = useState<SearchResultItem | null>(
    null
  )
  const [copiedAnswer, setCopiedAnswer] = useState(false)
  const [progress, setProgress] = useState<SearchProgress>(() => ({
    searchQueries: [],
    sources: [],
    status: initialQueryText ? 'planning' : 'idle',
    message: initialQueryText ? 'Searching web...' : undefined
  }))
  const [error, setError] = useState<string | null>(null)
  const restoredInitialQueryRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const durableMessagesRef = useRef<UIMessage[]>([])
  const activeTurnRef = useRef<SearchTurn | null>(null)
  const completedTurnsRef = useRef<SearchTurn[]>([])
  const requestIdRef = useRef(0)
  const persistTimerRef = useRef<number | null>(null)
  const serverPersistSnapshotRef = useRef<string | null>(null)

  const endpoint = useMemo(() => apiBase ?? DEFAULT_API_BASE, [apiBase])
  const activeCitationMaps = useMemo(
    () => buildCitationMaps(progress.sources),
    [progress.sources]
  )
  const linkedAnswer = useMemo(
    () => linkPlainCitations(answer, progress.sources),
    [answer, progress.sources]
  )
  const displayFollowUps = useMemo(
    () =>
      progress.status === 'done' && answer.trim() && followUps.length === 0
        ? buildFallbackFollowUps(activeQuestion, answer)
        : followUps,
    [activeQuestion, answer, followUps, progress.status]
  )

  const stopSearch = useCallback(() => {
    requestIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setPendingQuery(null)
    setProgress(prev => ({
      ...prev,
      status: answer.trim() ? 'done' : 'idle',
      message: answer.trim() ? 'Stopped' : undefined
    }))
  }, [answer])

  useEffect(() => {
    const abortForNavigation = () => {
      requestIdRef.current += 1
      abortRef.current?.abort()
      abortRef.current = null
    }

    window.addEventListener('pagehide', abortForNavigation)
    return () => {
      window.removeEventListener('pagehide', abortForNavigation)
    }
  }, [])

  const flushPendingPersistence = useCallback(() => {
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    persistDurableMessages(searchId, durableMessagesRef.current)
    if (!persistToServer) return
    const serverSnapshot = JSON.stringify(durableMessagesRef.current)
    if (serverPersistSnapshotRef.current !== serverSnapshot) {
      serverPersistSnapshotRef.current = serverSnapshot
      persistDurableMessagesToServer(searchId, durableMessagesRef.current)
    }
  }, [persistToServer, searchId])

  useEffect(() => {
    completedTurnsRef.current = completedTurns
  }, [completedTurns])

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
      followUps: displayFollowUps
    }
  }, [activeQuestion, answer, displayFollowUps, progress.sources, searchId])

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim()
      if (!trimmed) return

      recordRecentSearch(trimmed, initialMode)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      commitDurableSearchUrl(searchId)

      const isCurrentRequest = () =>
        requestIdRef.current === requestId && !controller.signal.aborted

      const previousTurn = activeTurnRef.current
      const contextTurns = compactSearchContext([
        ...completedTurnsRef.current,
        ...(previousTurn?.answer.trim() ? [previousTurn] : [])
      ])
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
        message: 'Searching web...'
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
        if (persistTimerRef.current) {
          window.clearTimeout(persistTimerRef.current)
        }
        persistTimerRef.current = window.setTimeout(() => {
          persistTimerRef.current = null
          persistDurableMessages(searchId, durableMessagesRef.current)
        }, 300)
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
        let streamCompleted = false

        const persistSnapshot = () => {
          writeDurableTurn({
            durableAnswer: streamedAnswer,
            durableFollowUps: streamedFollowUps,
            durableSources: streamedSources
          })
        }

        const requestBody = {
          query: trimmed,
          mode: initialMode,
          stream: true,
          ...(contextTurns.length > 0 ? { context: contextTurns } : {})
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify(requestBody),
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
          if (!isCurrentRequest()) return

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
                answerModel: data.answer_model ?? prev.answerModel,
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
                answerModel: data.answer_model ?? prev.answerModel,
                resolvedQuery: data.resolved_query,
                classification: data.classification?.type,
                searchQueries: data.search_queries ?? [],
                status: 'searching',
                message: 'Searching web...'
              }))
              return
            case 'search_started':
              setProgress(prev => ({
                ...prev,
                answerModel: data.answer_model ?? prev.answerModel,
                status: 'searching',
                message: `Running ${data.search_queries?.length ?? 0} searches...`
              }))
              return
            case 'source_found':
              if (
                !streamedSources.some(
                  s => getSourceIdentity(s) === getSourceIdentity(data.source)
                )
              ) {
                streamedSources = [...streamedSources, data.source as Source]
                persistSnapshot()
              }
              setProgress(prev => {
                if (
                  prev.sources.some(
                    s => getSourceIdentity(s) === getSourceIdentity(data.source)
                  )
                ) {
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
                message: 'Reading sources...'
              }))
              return
            case 'answer_delta':
              streamedAnswer += data.delta ?? ''
              persistSnapshot()
              setAnswer(prev => prev + (data.delta ?? ''))
              setProgress(prev => ({
                ...prev,
                status: 'answering',
                message: 'Writing answer...'
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
              streamCompleted = true
              persistSnapshot()
              flushPendingPersistence()
              setProgress(prev => ({
                ...prev,
                answerModel:
                  data.usage?.answer_model ??
                  data.answer_model ??
                  prev.answerModel,
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
          if (!isCurrentRequest()) break
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

        if (!isCurrentRequest() || streamCompleted) return

        if (streamedAnswer.trim()) {
          persistSnapshot()
          flushPendingPersistence()
          setProgress(prev => ({
            ...prev,
            status: 'done',
            message: 'Answer ready'
          }))
          return
        }

        setError('Search ended before returning an answer.')
        setProgress(prev => ({
          ...prev,
          status: 'error',
          message: 'Search ended before returning an answer.'
        }))
      } catch (err) {
        if (!isCurrentRequest()) return
        if ((err as Error).name === 'AbortError') return
        console.error('Search failed:', err)
        const message =
          err instanceof Error ? err.message : 'Search could not complete'
        setError(message)
        setProgress(prev => ({ ...prev, status: 'error', message }))
      } finally {
        if (isCurrentRequest()) {
          flushPendingPersistence()
          setPendingQuery(null)
        }
      }
    },
    [endpoint, apiKey, flushPendingPersistence, initialMode, searchId]
  )

  useEffect(() => {
    const cleanup = () => {
      requestIdRef.current += 1
      abortRef.current?.abort()
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
    }
    const initialRunKey = `${searchId ?? 'search_session'}:${initialMode}:${
      initialQuery?.trim() ?? ''
    }`
    if (restoredInitialQueryRef.current === initialRunKey) return cleanup

    const trimmedInitialQuery = initialQuery?.trim() ?? ''
    const storedMessages = readStoredSearchMessages(searchId)
    const storedTurns = searchId
      ? toStoredSearchTurns(searchId, storedMessages)
      : []
    const latestTurn = storedTurns.at(-1)

    if (
      latestTurn &&
      (!trimmedInitialQuery ||
        latestTurn.query.trim().toLowerCase() ===
          trimmedInitialQuery.toLowerCase())
    ) {
      restoredInitialQueryRef.current = initialRunKey
      durableMessagesRef.current = storedMessages
      setCompletedTurns(storedTurns.slice(0, -1))
      setActiveQuestion(latestTurn.query)
      setQuery(latestTurn.query)
      setAnswer(latestTurn.answer)
      setFollowUps(latestTurn.followUps)
      setError(null)
      setProgress({
        searchQueries: [],
        sources: latestTurn.sources,
        status: 'done',
        message: 'Restored answer'
      })
      activeTurnRef.current = latestTurn
      commitDurableSearchUrl(searchId)
      recordRecentSearch(latestTurn.query, initialMode)
      return cleanup
    }

    if (trimmedInitialQuery) {
      restoredInitialQueryRef.current = initialRunKey
      void runSearch(trimmedInitialQuery)
    }
    return cleanup
  }, [initialMode, initialQuery, runSearch, searchId])

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

  const isLoading =
    progress.status === 'planning' ||
    progress.status === 'searching' ||
    progress.status === 'reading' ||
    progress.status === 'answering'

  const submitFollowUp = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (isLoading) return
      const trimmed = followUpInput.trim()
      if (!trimmed) return
      setFollowUpInput('')
      setQuery(trimmed)
      handleFollowUp(trimmed)
    },
    [followUpInput, handleFollowUp, isLoading]
  )

  const retryActiveSearch = useCallback(() => {
    if (isLoading) return
    const retryQuery = activeQuestion.trim() || query.trim()
    if (!retryQuery) return
    setQuery(retryQuery)
    void runSearch(retryQuery)
  }, [activeQuestion, isLoading, query, runSearch])

  const handleVoiceTranscript = useCallback((text: string) => {
    setQuery(text)
  }, [])

  const copyAnswer = useCallback(async () => {
    const text = answer.trim()
    if (!text) return
    const copied = await safeCopyTextToClipboard(text)
    if (!copied) {
      toast.error('Could not copy answer')
      return
    }
    setCopiedAnswer(true)
    toast.success('Answer copied')
    window.setTimeout(() => setCopiedAnswer(false), 1600)
  }, [answer])

  return (
    <div className="flex w-full gap-6">
      <section
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-32 pt-8 sm:px-6"
        data-testid="brok-search-client"
      >
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" />
            <span>Brok Search</span>
            {progress.answerModel?.name ? (
              <span className="hidden text-xs text-muted-foreground/70 sm:inline">
                · {progress.answerModel.name}
              </span>
            ) : null}
          </div>
          <form
            className="rounded-2xl border border-zinc-200/80 bg-white/90 p-2 shadow-[0_18px_55px_-42px_rgba(15,23,42,0.35)] backdrop-blur transition-colors focus-within:border-zinc-300"
            onSubmit={event => {
              event.preventDefault()
              void runSearch(query)
            }}
            aria-label="New search"
          >
            <div className="flex min-h-11 items-center gap-2">
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Ask anything..."
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none"
                aria-label="Search query"
              />
              <div className="flex shrink-0 items-center gap-1">
                {modelSelectorData ? (
                  <div className="hidden sm:block">
                    <ModelSelectorClient data={modelSelectorData} />
                  </div>
                ) : null}
                <VoiceInputButton onTranscript={handleVoiceTranscript} />
                <button
                  type={isLoading ? 'button' : 'submit'}
                  disabled={!isLoading && !query.trim()}
                  className="inline-flex size-11 min-h-11 min-w-11 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={isLoading ? 'Stop search' : 'Search'}
                  onClick={event => {
                    if (!isLoading) return
                    event.preventDefault()
                    stopSearch()
                  }}
                >
                  {isLoading ? (
                    <Square className="size-3.5 fill-current" />
                  ) : (
                    <ArrowUp className="size-4" strokeWidth={2.5} />
                  )}
                </button>
              </div>
            </div>
          </form>
          {modelSelectorData ? (
            <div className="flex justify-end sm:hidden">
              <ModelSelectorClient data={modelSelectorData} />
            </div>
          ) : null}
        </header>

        {error && (
          <div
            className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
            data-testid="brok-search-error"
          >
            <div className="flex min-w-0 items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span className="min-w-0">{error}</span>
            </div>
            <button
              type="button"
              onClick={retryActiveSearch}
              disabled={isLoading || !(activeQuestion.trim() || query.trim())}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white/75 px-3 text-xs font-medium text-red-700 transition-colors hover:bg-white hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </button>
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
          <SourceList
            sources={progress.sources}
            onOpenSource={source => setActiveSource(toSearchResultItem(source))}
          />
        )}

        {isLoading && !answer && (
          <AnswerLoadingCard query={pendingQuery ?? activeQuestion ?? query} />
        )}

        {answer && (
          <article
            className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-5 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.28)]"
            data-testid="brok-search-answer"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="inline-flex items-center gap-2">
                {hasOnlyLocalFallbackSources(progress.sources) ? (
                  <ShieldAlert className="size-3.5 text-amber-600" />
                ) : (
                  <Globe2 className="size-3.5" />
                )}
                <span>
                  {hasOnlyLocalFallbackSources(progress.sources)
                    ? 'Model knowledge fallback'
                    : `${progress.sources.length} sources`}
                  {progress.classification
                    ? ` • ${progress.classification.replace(/\//g, ' ')}`
                    : ''}
                  {progress.answerModel?.name
                    ? ` • ${progress.answerModel.name}`
                    : ''}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={copyAnswer}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                  aria-label={copiedAnswer ? 'Answer copied' : 'Copy answer'}
                  title={copiedAnswer ? 'Copied' : 'Copy answer'}
                >
                  {copiedAnswer ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
                <VoiceOutputButton text={answer} />
              </div>
            </div>
            <MarkdownMessage
              message={linkedAnswer}
              citationMaps={activeCitationMaps}
              onCitationOpen={setActiveSource}
            />
            {progress.status === 'done' &&
              hasOnlyLocalFallbackSources(progress.sources) && (
                <FallbackSourcesNotice />
              )}
            {progress.status === 'done' && progress.sources.length === 0 && (
              <NoSourcesNotice />
            )}
          </article>
        )}

        {progress.status === 'done' && (
          <FollowUpChips
            followUps={displayFollowUps}
            onSelect={handleFollowUp}
            disabled={isLoading}
            isLoading={isLoading}
          />
        )}

        {(answer || completedTurns.length > 0 || isLoading) && (
          <form
            className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] mt-2 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-2 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.35)] backdrop-blur"
            data-testid="brok-follow-up-form"
            onSubmit={submitFollowUp}
          >
            <input
              value={followUpInput}
              onChange={event => setFollowUpInput(event.target.value)}
              placeholder={
                isLoading ? 'Waiting for this answer...' : 'Ask a follow-up...'
              }
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none"
              aria-label="Ask a follow-up"
              disabled={isLoading}
            />
            <button
              type={isLoading ? 'button' : 'submit'}
              disabled={!isLoading && !followUpInput.trim()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={isLoading ? 'Stop search' : 'Send follow-up'}
              onClick={event => {
                if (!isLoading) return
                event.preventDefault()
                stopSearch()
              }}
            >
              {isLoading ? (
                <Square className="size-3.5 fill-current" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </button>
          </form>
        )}
      </section>

      <RelatedQuestionsPanel
        followUps={displayFollowUps}
        onSelect={handleFollowUp}
        isLoading={isLoading}
      />
      <SourceSidePanel
        source={activeSource}
        open={Boolean(activeSource)}
        onOpenChange={open => {
          if (!open) setActiveSource(null)
        }}
      />
    </div>
  )
}

function AnswerLoadingCard({ query }: { query?: string | null }) {
  const trimmedQuery = query?.trim()

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
      {trimmedQuery && (
        <p
          className="mb-4 line-clamp-2 text-sm font-medium leading-6 text-zinc-900"
          data-testid="brok-answer-loading-query"
        >
          Searching: {trimmedQuery}
        </p>
      )}
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

function FallbackSourcesNotice() {
  return (
    <div
      className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-800"
      data-testid="brok-fallback-sources-notice"
    >
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
      <span>
        Live web search was unavailable, so this answer is not verified by web
        sources yet. Rerun it when search is back for real citations.
      </span>
    </div>
  )
}

function CompletedTurn({ turn }: { turn: SearchTurn }) {
  const citationMaps = useMemo(
    () => buildCitationMaps(turn.sources),
    [turn.sources]
  )
  const linkedAnswer = useMemo(
    () => linkPlainCitations(turn.answer, turn.sources),
    [turn.answer, turn.sources]
  )

  return (
    <section
      className="flex flex-col gap-3 border-b border-zinc-200/70 pb-5"
      data-testid="completed-search-turn"
    >
      <div className="ml-auto max-w-[85%] rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900">
        {turn.query}
      </div>
      {turn.sources.length > 0 && (
        <div
          className="mobile-chip-row flex gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
          aria-label="Previous sources"
        >
          {turn.sources.slice(0, 4).map((source, index) => (
            <a
              key={`${turn.id}-${source.id}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 max-w-[12rem] shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-white/80 px-3 text-[11px] font-medium text-zinc-600 hover:text-zinc-950"
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
        <MarkdownMessage message={linkedAnswer} citationMaps={citationMaps} />
      </article>
    </section>
  )
}

function SearchProgressIndicator({ progress }: { progress: SearchProgress }) {
  const steps = [
    { id: 'searching', label: 'Searching web' },
    { id: 'reading', label: 'Reading sources' },
    { id: 'answering', label: 'Writing answer' }
  ] as const

  const order = steps.map(step => step.id)
  const activeIndex =
    progress.status === 'planning'
      ? 0
      : order.indexOf(progress.status as (typeof order)[number])

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

function SourceList({
  defaultExpanded = false,
  onOpenSource,
  sources
}: {
  defaultExpanded?: boolean
  onOpenSource: (source: Source) => void
  sources: Source[]
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    if (defaultExpanded) setExpanded(true)
  }, [defaultExpanded])

  if (sources.length === 0) return null
  const visibleSources = expanded ? sources : sources.slice(0, 6)
  const fallbackOnly = hasOnlyLocalFallbackSources(sources)

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-white/75 p-3 shadow-[0_16px_40px_-34px_rgba(15,23,42,0.2)]"
      data-testid="brok-search-sources"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {fallbackOnly ? (
            <ShieldAlert className="size-3.5 shrink-0 text-amber-600" />
          ) : (
            <Globe2 className="size-3.5 shrink-0 text-zinc-500" />
          )}
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {fallbackOnly ? 'Fallback' : 'Sources'}
          </h2>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-700">
            {sources.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(open => !open)}
          className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          aria-expanded={expanded}
          aria-controls="brok-source-details"
        >
          {expanded ? 'Hide details' : 'Show details'}
          <ChevronDown
            className={`size-3.5 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      <ul
        className={
          expanded
            ? 'grid grid-cols-1 gap-2 md:grid-cols-2'
            : 'mobile-chip-row flex gap-2 overflow-x-auto pb-1'
        }
        id="brok-source-details"
      >
        {visibleSources.map((source, index) => {
          const sourceIndex = index + 1
          const sourceDomain = source.publisher ?? safeHostname(source.url)

          if (!expanded) {
            return (
              <li
                key={getSourceIdentity(source)}
                className="min-w-0 shrink-0"
                data-testid={`brok-search-source-${index}`}
              >
                <button
                  type="button"
                  onClick={() => onOpenSource(source)}
                  className="inline-flex h-10 max-w-[13rem] items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/90 px-3 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-white hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                  aria-label={`Verify source ${sourceIndex}: ${source.title}`}
                >
                  <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-mono text-[9px] font-semibold text-zinc-600">
                    {sourceIndex}
                  </span>
                  <span className="truncate">{sourceDomain}</span>
                  <span className="sr-only">{source.title}</span>
                </button>
              </li>
            )
          }

          return (
            <li
              key={getSourceIdentity(source)}
              className={`flex flex-col gap-1 rounded-xl border p-3 ${
                isLocalFallbackSource(source)
                  ? 'border-amber-200/80 bg-amber-50/70'
                  : 'border-zinc-200/70 bg-white/90'
              }`}
              data-testid={`brok-search-source-${index}`}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenSource(source)}
                  className="line-clamp-2 min-h-11 min-w-0 flex-1 rounded-md py-1 text-left text-xs font-semibold text-zinc-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                  aria-label={`Verify source ${sourceIndex}: ${source.title}`}
                >
                  [{sourceIndex}] {source.title}
                </button>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                  aria-label={`Open ${source.title}`}
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {sourceDomain}
              </span>
              {source.snippet && (
                <p className="line-clamp-3 text-[12px] text-zinc-600">
                  {source.snippet}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {!expanded && sources.length > visibleSources.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          +{sources.length - visibleSources.length} more sources in details
        </p>
      )}
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
