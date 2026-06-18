'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AlertCircle,
  ArrowUp,
  Check,
  ChevronDown,
  ExternalLink,
  Globe2,
  Info,
  Loader2,
  ShieldAlert,
  Sparkles,
  Square
} from 'lucide-react'
import { toast } from 'sonner'

import type { SearchResultItem } from '@/lib/types'
import type { UIMessage } from '@/lib/types/ai'
import type { ModelSelectorData } from '@/lib/types/model-selector'
import type { SearchMode } from '@/lib/types/search'

import { AnswerToolbar } from './search/answer-toolbar'
import { recordRecentSearch } from './search/recent-searches'
import { SourceSidePanel } from './search/source-side-panel'
import { FollowUpChips, type FollowUpItem } from './follow-up-chips'
import { MarkdownMessage } from './message'
import { ModelSelectorClient } from './model-selector-client'
import { VoiceInputButton } from './voice-input-button'

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
  initialMessages?: UIMessage[]
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
const SEARCH_RESPONSE_START_TIMEOUT_MS = 20_000
const SEARCH_STREAM_IDLE_TIMEOUT_MS = 45_000
const DURABLE_STREAM_SNAPSHOT_INTERVAL_MS = 1_000
const STREAM_IDLE_ABORT_REASON = 'brok-search-stream-idle-timeout'

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
  if (sources.length === 0 || hasOnlyLocalFallbackSources(sources)) return {}

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
  if (sources.length === 0 || hasOnlyLocalFallbackSources(sources)) {
    return message
  }

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

function getReloadablePendingSearch(messages: UIMessage[]) {
  const lastIndex = messages.length - 1
  if (lastIndex < 0) return null

  const lastMessage = messages[lastIndex]
  const previousMessage = messages[lastIndex - 1]
  const userIndex = lastMessage?.role === 'user' ? lastIndex : lastIndex - 1
  const userMessage = messages[userIndex]
  const assistantMessage = userIndex >= 0 ? messages[userIndex + 1] : undefined

  if (userMessage?.role !== 'user') return null
  if (
    assistantMessage &&
    assistantMessage.role === 'assistant' &&
    getTextPart(assistantMessage).trim()
  ) {
    return null
  }
  if (
    previousMessage?.role === 'user' &&
    lastMessage?.role === 'assistant' &&
    !getTextPart(lastMessage).trim()
  ) {
    const query = getTextPart(previousMessage).trim()
    return query
      ? {
          query,
          completedMessages: messages.slice(0, lastIndex - 1)
        }
      : null
  }

  const query = getTextPart(userMessage).trim()
  return query
    ? {
        query,
        completedMessages: messages.slice(0, userIndex)
      }
    : null
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

function getSearchErrorMessage(error: unknown, abortReason?: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    if (abortReason === STREAM_IDLE_ABORT_REASON) {
      return 'Search stalled before finishing. Please try again.'
    }
    return 'Search timed out before the server started responding. Please try again.'
  }

  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return 'Could not reach Brok Search. Check your connection and try again.'
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'Search could not complete. Please try again.'
}

function isSpecificServerProgressMessage(message: string | undefined) {
  return (
    message === 'Loading Brok product context' ||
    message === 'Loading cached answer'
  )
}

function getProgressMessage(
  currentMessage: string | undefined,
  fallbackMessage: string
) {
  return isSpecificServerProgressMessage(currentMessage)
    ? currentMessage
    : fallbackMessage
}

/**
 * Client for the Brok Search SSE endpoint. Renders the streaming answer,
 * source list, follow-up chips, and step-by-step progress UI as the pipeline
 * progresses. The component owns the streaming lifecycle.
 */
export function BrokSearchClient({
  initialQuery,
  initialMode = 'quick',
  initialMessages,
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
  const [progress, setProgress] = useState<SearchProgress>(() => ({
    searchQueries: [],
    sources: [],
    status: initialQueryText ? 'planning' : 'idle',
    message: initialQueryText ? 'Planning search query...' : undefined
  }))
  const [error, setError] = useState<string | null>(null)
  const [interruptedSearch, setInterruptedSearch] = useState<string | null>(
    null
  )
  const restoredInitialQueryRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const durableMessagesRef = useRef<UIMessage[]>([])
  const activeTurnRef = useRef<SearchTurn | null>(null)
  const completedTurnsRef = useRef<SearchTurn[]>([])
  const requestIdRef = useRef(0)
  const activeRequestKeyRef = useRef<string | null>(null)
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
    activeRequestKeyRef.current = null
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
      activeRequestKeyRef.current = null
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
    async (
      q: string,
      options: {
        replaceActiveTurn?: boolean
      } = {}
    ) => {
      const trimmed = q.trim()
      if (!trimmed) return
      const requestKey = `${initialMode}:${trimmed.toLowerCase()}`
      if (activeRequestKeyRef.current === requestKey) return

      recordRecentSearch(trimmed, initialMode)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      activeRequestKeyRef.current = requestKey
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId

      const isCurrentRequest = () =>
        requestIdRef.current === requestId && !controller.signal.aborted

      const previousTurn = activeTurnRef.current
      const replaceActiveTurn = options.replaceActiveTurn === true
      if (replaceActiveTurn && previousTurn?.answer.trim()) {
        durableMessagesRef.current = durableMessagesRef.current.slice(0, -2)
        persistDurableMessages(searchId, durableMessagesRef.current)
      }
      const contextTurns = compactSearchContext([
        ...completedTurnsRef.current,
        ...(previousTurn?.answer.trim() && !replaceActiveTurn
          ? [previousTurn]
          : [])
      ])
      if (previousTurn?.answer.trim() && !replaceActiveTurn) {
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
      setInterruptedSearch(null)
      setAnswer('')
      setFollowUps([])
      setError(null)
      setProgress({
        searchQueries: [],
        sources: [],
        status: 'planning',
        message: 'Connecting to Brok Search...'
      })

      const writeDurableTurn = ({
        durableAnswer,
        durableFollowUps,
        durableSources,
        persistNow = false
      }: {
        durableAnswer: string
        durableFollowUps: FollowUpItem[]
        durableSources: Source[]
        persistNow?: boolean
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
        if (persistNow) {
          persistDurableMessages(searchId, durableMessagesRef.current)
          return
        }
        persistTimerRef.current = window.setTimeout(() => {
          persistTimerRef.current = null
          persistDurableMessages(searchId, durableMessagesRef.current)
        }, 300)
      }

      activeTurnRef.current = {
        id: turnId,
        query: trimmed,
        answer: '',
        sources: [],
        followUps: []
      }
      writeDurableTurn({
        durableAnswer: '',
        durableFollowUps: [],
        durableSources: [],
        persistNow: true
      })

      let responseStartTimedOut = false
      let cancelPendingDurableSnapshot = () => {}

      try {
        let streamedAnswer = ''
        let streamedSources: Source[] = []
        let streamedFollowUps: FollowUpItem[] = []
        let streamCompleted = false
        let lastDurableSnapshotAt = 0
        let pendingDurableSnapshotTimer: number | null = null
        let streamIdleTimeout: number | null = null

        const persistSnapshot = ({ force = false } = {}) => {
          if (
            !streamedAnswer.trim() &&
            streamedSources.length === 0 &&
            streamedFollowUps.length === 0
          ) {
            return
          }
          const now = Date.now()
          const elapsed = now - lastDurableSnapshotAt
          const writeSnapshot = () => {
            if (pendingDurableSnapshotTimer) {
              window.clearTimeout(pendingDurableSnapshotTimer)
              pendingDurableSnapshotTimer = null
            }
            lastDurableSnapshotAt = Date.now()
            writeDurableTurn({
              durableAnswer: streamedAnswer,
              durableFollowUps: streamedFollowUps,
              durableSources: streamedSources
            })
          }

          if (force || elapsed >= DURABLE_STREAM_SNAPSHOT_INTERVAL_MS) {
            writeSnapshot()
            return
          }

          if (pendingDurableSnapshotTimer) return
          pendingDurableSnapshotTimer = window.setTimeout(
            writeSnapshot,
            DURABLE_STREAM_SNAPSHOT_INTERVAL_MS - elapsed
          )
        }

        cancelPendingDurableSnapshot = () => {
          if (!pendingDurableSnapshotTimer) return
          window.clearTimeout(pendingDurableSnapshotTimer)
          pendingDurableSnapshotTimer = null
        }

        const persistFinalSnapshot = () => {
          cancelPendingDurableSnapshot()
          writeDurableTurn({
            durableAnswer: streamedAnswer,
            durableFollowUps: streamedFollowUps,
            durableSources: streamedSources,
            persistNow: true
          })
        }
        const clearStreamIdleTimeout = () => {
          if (!streamIdleTimeout) return
          window.clearTimeout(streamIdleTimeout)
          streamIdleTimeout = null
        }
        const refreshStreamIdleTimeout = () => {
          clearStreamIdleTimeout()
          streamIdleTimeout = window.setTimeout(() => {
            if (!isCurrentRequest() || streamCompleted) return
            controller.abort(STREAM_IDLE_ABORT_REASON)
          }, SEARCH_STREAM_IDLE_TIMEOUT_MS)
        }

        const requestBody = {
          query: trimmed,
          mode: initialMode,
          stream: true,
          ...(contextTurns.length > 0 ? { context: contextTurns } : {})
        }

        const responseStartTimeout = window.setTimeout(() => {
          responseStartTimedOut = true
          controller.abort()
        }, SEARCH_RESPONSE_START_TIMEOUT_MS)
        let response: Response
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          })
        } finally {
          window.clearTimeout(responseStartTimeout)
        }

        if (!response.ok || !response.body) {
          let responseMessage = ''
          try {
            const errorBody = (await response.json()) as {
              error?: string
              message?: string
            }
            responseMessage = errorBody.error ?? errorBody.message ?? ''
          } catch {
            // Some edge responses do not include JSON; the status is enough.
          }
          const message =
            responseMessage || `Search request failed (${response.status})`
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
                message: getProgressMessage(
                  prev.message,
                  'Searching sources...'
                )
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
                message: getProgressMessage(
                  prev.message,
                  'Fetching and ranking sources...'
                )
              }))
              return
            case 'search_started':
              setProgress(prev => ({
                ...prev,
                answerModel: data.answer_model ?? prev.answerModel,
                status: 'searching',
                message: getProgressMessage(
                  prev.message,
                  `Running ${data.search_queries?.length ?? 0} searches...`
                )
              }))
              return
            case 'source_found':
              if (
                !streamedSources.some(
                  s => getSourceIdentity(s) === getSourceIdentity(data.source)
                )
              ) {
                streamedSources = [...streamedSources, data.source as Source]
                persistSnapshot({ force: true })
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
              persistSnapshot({ force: true })
              setFollowUps(data.follow_ups ?? [])
              return
            case 'follow_ups':
              streamedFollowUps = data.items ?? data.follow_ups ?? []
              persistSnapshot({ force: true })
              setFollowUps(streamedFollowUps)
              return
            case 'done':
              streamCompleted = true
              clearStreamIdleTimeout()
              persistFinalSnapshot()
              commitDurableSearchUrl(searchId)
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
              clearStreamIdleTimeout()
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

        refreshStreamIdleTimeout()
        while (true) {
          const { done, value } = await reader.read()
          clearStreamIdleTimeout()
          if (!isCurrentRequest()) break
          if (done) break
          refreshStreamIdleTimeout()
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

        clearStreamIdleTimeout()

        if (!isCurrentRequest() || streamCompleted) return

        if (streamedAnswer.trim()) {
          persistFinalSnapshot()
          commitDurableSearchUrl(searchId)
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
        cancelPendingDurableSnapshot()
        const isResponseStartTimeout =
          responseStartTimedOut && requestIdRef.current === requestId
        if (!isCurrentRequest() && !isResponseStartTimeout) return
        console.error('Search failed:', err)
        const message = getSearchErrorMessage(err, controller.signal.reason)
        setError(message)
        setProgress(prev => ({ ...prev, status: 'error', message }))
      } finally {
        cancelPendingDurableSnapshot()
        if (requestIdRef.current === requestId) {
          if (!controller.signal.aborted) {
            flushPendingPersistence()
          }
          setPendingQuery(null)
          activeRequestKeyRef.current = null
        }
      }
    },
    [endpoint, apiKey, flushPendingPersistence, initialMode, searchId]
  )

  useEffect(() => {
    if (restoredInitialQueryRef.current) return

    const trimmedInitialQuery = initialQuery?.trim() ?? ''
    const storedMessages =
      initialMessages && initialMessages.length > 0
        ? initialMessages
        : readStoredSearchMessages(searchId)
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
      restoredInitialQueryRef.current = true
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
      return
    }

    const pendingSearch = getReloadablePendingSearch(storedMessages)
    if (
      pendingSearch &&
      (!trimmedInitialQuery ||
        pendingSearch.query.trim().toLowerCase() ===
          trimmedInitialQuery.toLowerCase())
    ) {
      restoredInitialQueryRef.current = true
      durableMessagesRef.current = pendingSearch.completedMessages
      setCompletedTurns(
        searchId
          ? toStoredSearchTurns(searchId, pendingSearch.completedMessages)
          : []
      )
      setActiveQuestion(pendingSearch.query)
      setQuery(pendingSearch.query)
      setPendingQuery(null)
      setInterruptedSearch(pendingSearch.query)
      setError(null)
      setProgress({
        searchQueries: [],
        sources: [],
        status: 'idle',
        message: undefined
      })
      commitDurableSearchUrl(searchId)
      return
    }

    if (trimmedInitialQuery) {
      restoredInitialQueryRef.current = true
      void runSearch(trimmedInitialQuery)
    }
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
    }
  }, [initialMessages, initialMode, initialQuery, runSearch, searchId])

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
  const hasTrustedSources =
    progress.sources.length > 0 &&
    !hasOnlyLocalFallbackSources(progress.sources)

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

  const handleVoiceTranscript = useCallback((text: string) => {
    setQuery(text)
  }, [])

  const handleShareAnswer = useCallback(async () => {
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
  }, [])

  const handleRegenerateAnswer = useCallback(() => {
    const target = activeQuestion.trim()
    if (!target || isLoading) return
    setQuery(target)
    void runSearch(target, { replaceActiveTurn: true })
  }, [activeQuestion, isLoading, runSearch])

  const handleResumeInterruptedSearch = useCallback(() => {
    const target = interruptedSearch?.trim()
    if (!target || isLoading) return
    setQuery(target)
    void runSearch(target)
  }, [interruptedSearch, isLoading, runSearch])

  const handleReadAnswerAloud = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast.error('Read aloud not supported')
      return
    }
    const synth = window.speechSynthesis
    synth.cancel()
    synth.speak(new SpeechSynthesisUtterance(answer))
  }, [answer])

  const handleTranslateAnswer = useCallback((lang: string) => {
    toast.info(`Translation to ${lang} would run server-side here.`)
  }, [])

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
              />
              <div className="flex shrink-0 items-center gap-1">
                {modelSelectorData ? (
                  <div className="hidden min-w-0 sm:block">
                    <ModelSelectorClient data={modelSelectorData} compact />
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
            className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700"
            role="alert"
            data-testid="brok-search-error"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {interruptedSearch && !isLoading && !answer && !error && (
          <div
            className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"
            data-testid="brok-search-interrupted"
          >
            <span>This search was interrupted before an answer was saved.</span>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-amber-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-800"
              onClick={handleResumeInterruptedSearch}
            >
              Resume search
            </button>
          </div>
        )}

        {completedTurns.map(turn => (
          <CompletedTurn
            key={turn.id}
            turn={turn}
            onOpenSource={setActiveSource}
          />
        ))}

        {activeQuestion && (
          <div
            className="ml-auto max-w-[85%] break-words rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-[0_14px_40px_-34px_rgba(15,23,42,0.35)]"
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

        {isLoading && !answer && <AnswerLoadingCard />}

        {answer && (
          <article
            className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-5 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.28)]"
            data-testid="brok-search-answer"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
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
              <span
                className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-medium ${
                  hasTrustedSources
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                }`}
                data-testid="brok-answer-trust-badge"
              >
                {hasTrustedSources ? (
                  <>
                    <Check className="size-3" />
                    Sources attached
                  </>
                ) : (
                  <>
                    <Info className="size-3" />
                    Verify before relying
                  </>
                )}
              </span>
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
            {progress.status === 'done' && (
              <AnswerToolbar
                answerText={answer}
                onShare={handleShareAnswer}
                onRegenerate={handleRegenerateAnswer}
                onReadAloud={handleReadAnswerAloud}
                onTranslate={handleTranslateAnswer}
                className="mt-2"
              />
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
            className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-10 mt-2 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white/95 p-2 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.35)] backdrop-blur"
            data-testid="brok-follow-up-form"
            onSubmit={submitFollowUp}
          >
            <input
              value={followUpInput}
              onChange={event => setFollowUpInput(event.target.value)}
              placeholder={
                isLoading ? 'Waiting for this answer...' : 'Ask a follow-up...'
              }
              className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none"
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

function CompletedTurn({
  onOpenSource,
  turn
}: {
  onOpenSource: (source: SearchResultItem) => void
  turn: SearchTurn
}) {
  const fallbackOnly = hasOnlyLocalFallbackSources(turn.sources)
  const hasSources = turn.sources.length > 0
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
      <div className="ml-auto max-w-[85%] break-words rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900">
        {turn.query}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {fallbackOnly ? (
          <ShieldAlert className="size-3.5 text-amber-600" />
        ) : (
          <Check className="size-3.5 text-emerald-600" />
        )}
        <span>
          Previous answer
          {fallbackOnly
            ? ' • model knowledge fallback'
            : hasSources
              ? ` • ${turn.sources.length} source${turn.sources.length === 1 ? '' : 's'}`
              : ' • model knowledge'}
        </span>
      </div>
      {turn.sources.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 pb-1"
          aria-label={
            fallbackOnly ? 'Previous fallback context' : 'Previous sources'
          }
        >
          {turn.sources.slice(0, 4).map((source, index) => (
            <a
              key={`${turn.id}-${source.id}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex h-11 max-w-full items-center gap-1 rounded-full border px-3 text-[11px] font-medium transition-colors ${
                isLocalFallbackSource(source)
                  ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-zinc-200 bg-white/80 text-zinc-600 hover:text-zinc-950'
              }`}
            >
              <span className="shrink-0">[{index + 1}]</span>
              <span className="truncate">
                {isLocalFallbackSource(source)
                  ? 'Fallback context'
                  : (source.publisher ?? safeHostname(source.url))}
              </span>
            </a>
          ))}
        </div>
      )}
      <article className="rounded-2xl border border-zinc-200 bg-white/80 p-4 text-sm text-zinc-900">
        <MarkdownMessage
          message={linkedAnswer}
          citationMaps={citationMaps}
          onCitationOpen={onOpenSource}
        />
        {fallbackOnly && <FallbackSourcesNotice />}
      </article>
    </section>
  )
}

function SearchProgressIndicator({ progress }: { progress: SearchProgress }) {
  const steps = [
    { id: 'planning', label: 'Understanding' },
    { id: 'searching', label: 'Searching web' },
    { id: 'reading', label: 'Reading sources' },
    { id: 'answering', label: 'Writing answer' }
  ] as const

  const order = steps.map(step => step.id)
  const activeIndex = order.indexOf(progress.status as (typeof order)[number])

  return (
    <div
      className="rounded-2xl border border-zinc-200 bg-white/85 p-3 shadow-[0_18px_44px_-32px_rgba(15,23,42,0.18)]"
      data-testid="search-progress"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            <span className="truncate">
              {progress.message ?? 'Working on it...'}
            </span>
          </div>
          {progress.sources.length > 0 && (
            <span
              className="inline-flex h-7 shrink-0 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-medium text-zinc-600"
              data-testid="search-progress-source-count"
            >
              {progress.sources.length} source
              {progress.sources.length === 1 ? '' : 's'} found
            </span>
          )}
        </div>
        <ol className="grid grid-cols-4 gap-1 text-[11px] sm:text-xs">
          {steps.map((step, index) => {
            const isActive = index === activeIndex
            const isDone = activeIndex > index
            return (
              <li
                key={step.id}
                className={`flex min-w-0 items-center gap-1 rounded-full border px-2 py-1 ${
                  isActive
                    ? 'border-zinc-300 bg-zinc-950 text-white'
                    : isDone
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                }`}
              >
                {isDone ? (
                  <Check className="size-3 shrink-0" />
                ) : isActive ? (
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                ) : (
                  <span className="size-3 shrink-0 rounded-full border border-current/30" />
                )}
                <span className="truncate">{step.label}</span>
              </li>
            )
          })}
        </ol>
        {progress.searchQueries.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            {progress.searchQueries.map((q, index) => (
              <li
                key={`${q}-${index}`}
                className="max-w-full truncate rounded-full bg-zinc-100 px-2 py-0.5"
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
  onOpenSource,
  sources
}: {
  onOpenSource: (source: Source) => void
  sources: Source[]
}) {
  const [expanded, setExpanded] = useState(false)

  if (sources.length === 0) return null
  const visibleSources = expanded ? sources : sources.slice(0, 6)
  const fallbackOnly = hasOnlyLocalFallbackSources(sources)

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-white/80 p-3 shadow-[0_16px_40px_-34px_rgba(15,23,42,0.2)]"
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
            {fallbackOnly ? 'Fallback' : 'Sources used'}
          </h2>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-700">
            {sources.length}
          </span>
          {!fallbackOnly && (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              click any card to verify
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(open => !open)}
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
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
            : 'grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'
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
                className="min-w-0"
                data-testid={`brok-search-source-${index}`}
              >
                <button
                  type="button"
                  onClick={() => onOpenSource(source)}
                  className={`group flex min-h-24 w-full items-start gap-2 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 ${
                    isLocalFallbackSource(source)
                      ? 'border-amber-200/80 bg-amber-50/70 hover:bg-amber-50'
                      : 'border-zinc-200/80 bg-white/90 hover:border-zinc-300 hover:bg-white'
                  }`}
                  aria-label={`Verify source ${sourceIndex}: ${source.title}`}
                >
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-mono text-[10px] font-semibold text-zinc-600">
                    {sourceIndex}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium text-muted-foreground">
                      {sourceDomain}
                    </span>
                    <span className="line-clamp-2 text-xs font-semibold leading-5 text-zinc-900 group-hover:underline">
                      {source.title}
                    </span>
                    {source.snippet && (
                      <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-600">
                        {source.snippet}
                      </span>
                    )}
                  </span>
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
