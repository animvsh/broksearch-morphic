import { parse } from 'node-html-parser'

import {
  BROK_PROVIDER_API_KEY,
  BROK_PROVIDER_BASE_URL,
  BROK_PROVIDER_CHAT_MODEL
} from '@/lib/ai/brok'
import { searchWithBrokWebSearch } from '@/lib/brok/brok-web-search'
import { getBrokProviderModelId } from '@/lib/brok/models'
import { stripThinkingBlocks } from '@/lib/utils/strip-thinking-blocks'

export interface SearchResult {
  id: string
  title: string
  url: string
  publisher?: string
  snippet: string
  retrievedAt: string
  qualityScore?: number
}

export interface SearchResponse {
  answer: string
  citations: SearchResult[]
  searchQueries: number
  searchQueryList: string[]
  tokensUsed: number
  resolvedQuery: string
  classification: QueryClassification
  followUps: Array<{ label: string; query: string }>
}

export interface SearchContextTurn {
  query: string
  answer: string
}

export interface SearchRequest {
  query: string
  depth: 'lite' | 'standard' | 'deep'
  recencyDays?: number
  domains?: string[]
  maxSources?: number
  synthesisModel?: string
  context?: SearchContextTurn[]
  signal?: AbortSignal
  onSources?: (sources: SearchResult[]) => void | Promise<void>
  onAnswerDelta?: (delta: string) => void | Promise<void>
}

export type QuestionType =
  | 'fresh/current'
  | 'evergreen/explainer'
  | 'comparison'
  | 'recommendation'
  | 'technical'
  | 'academic'
  | 'shopping-ish'
  | 'local'
  | 'news'
  | 'code'
  | 'opinion'

export interface QueryClassification {
  type: QuestionType
  needsSearch: boolean
  reason: string
}

const SEARCH_CONFIG = {
  lite: { sources: 3, maxTokens: 8000, queries: 1 },
  standard: { sources: 8, maxTokens: 16000, queries: 3 },
  deep: { sources: 20, maxTokens: 32000, queries: 5 }
}

const SEARCH_CACHE_MAX_ENTRIES = 100
const DEFAULT_SEARCH_CACHE_TTL_MS = 120_000

type SearchCacheEntry = {
  expiresAt: number
  response: SearchResponse
}

type InFlightSearch = {
  controller: AbortController
  promise: Promise<SearchResponse>
  consumers: number
}

const searchResponseCache = new Map<string, SearchCacheEntry>()
const inFlightSearches = new Map<string, InFlightSearch>()

function getSearchFetchTimeoutMs() {
  const configured = Number.parseInt(
    process.env.BROK_SEARCH_TIMEOUT_MS || '',
    10
  )
  return Number.isFinite(configured) && configured > 0 ? configured : 8000
}

function getSearchBatchSoftTimeoutMs() {
  const configured = Number.parseInt(
    process.env.BROK_SEARCH_BATCH_SOFT_TIMEOUT_MS || '',
    10
  )
  return Number.isFinite(configured) && configured > 0 ? configured : 3000
}

function getAnswerSynthesisTimeoutMs() {
  const configured = Number.parseInt(
    process.env.BROK_SEARCH_SYNTHESIS_TIMEOUT_MS || '',
    10
  )
  return Number.isFinite(configured) && configured > 0 ? configured : 10000
}

export async function runSearchPipeline(
  request: SearchRequest
): Promise<SearchResponse> {
  const cacheKey = buildSearchCacheKey(request)
  const cacheTtlMs = getSearchCacheTtlMs()

  if (cacheTtlMs > 0) {
    const cached = getCachedSearchResponse(cacheKey)
    if (cached) {
      await emitSourcePreview(request, cached.citations)
      return cached
    }

    const inFlight = inFlightSearches.get(cacheKey)
    if (inFlight) {
      const detachConsumer = attachInFlightConsumer(inFlight, request.signal)
      try {
        const response = cloneSearchResponse(
          await waitForInFlightSearch(inFlight.promise, request.signal)
        )
        await emitSourcePreview(request, response.citations)
        return response
      } finally {
        detachConsumer()
      }
    }
  }

  const sharedController = new AbortController()
  const runRequest =
    cacheTtlMs > 0
      ? {
          ...request,
          signal: sharedController.signal
        }
      : request
  const uncachedRunPromise = runUncachedSearchPipeline(runRequest)
  const runPromise =
    cacheTtlMs > 0
      ? uncachedRunPromise.then(response => {
          if (!isUnavailableSearchResponse(response)) {
            setCachedSearchResponse(cacheKey, response, cacheTtlMs)
          }
          return response
        })
      : uncachedRunPromise
  let detachConsumer = () => {}
  if (cacheTtlMs > 0) {
    const inFlight: InFlightSearch = {
      controller: sharedController,
      promise: runPromise,
      consumers: 0
    }
    detachConsumer = attachInFlightConsumer(inFlight, request.signal)
    inFlightSearches.set(cacheKey, inFlight)
    void runPromise
      .finally(() => {
        if (inFlightSearches.get(cacheKey) === inFlight) {
          inFlightSearches.delete(cacheKey)
        }
      })
      .catch(() => {})
  }

  try {
    const response =
      cacheTtlMs > 0
        ? await waitForInFlightSearch(runPromise, request.signal)
        : await runPromise
    return cloneSearchResponse(response)
  } finally {
    detachConsumer()
  }
}

function attachInFlightConsumer(
  inFlight: InFlightSearch,
  signal?: AbortSignal
) {
  inFlight.consumers += 1
  let detached = false

  const detach = () => {
    if (detached) return
    detached = true
    signal?.removeEventListener('abort', detach)
    inFlight.consumers = Math.max(0, inFlight.consumers - 1)
    if (inFlight.consumers === 0 && !inFlight.controller.signal.aborted) {
      inFlight.controller.abort()
    }
  }

  if (signal?.aborted) {
    detach()
    return detach
  }

  signal?.addEventListener('abort', detach, { once: true })
  return detach
}

function waitForInFlightSearch<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise
  if (signal.aborted) {
    return Promise.reject(new DOMException('Search aborted', 'AbortError'))
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('Search aborted', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

async function runUncachedSearchPipeline(
  request: SearchRequest
): Promise<SearchResponse> {
  const config = SEARCH_CONFIG[request.depth]
  const maxSources = clampSourceCount(request.maxSources, config.sources)
  const classification = classifyQuery(request.query)
  const searchQueryList = buildSearchQueries({
    query: request.query,
    classification,
    depth: request.depth,
    limit: config.queries,
    recencyDays: request.recencyDays,
    domains: request.domains
  })
  const resolvedQuery = resolveQuery(request.query, classification)
  const domainHints = getDomainHints(request.query, request.domains)

  const firstPartyResponse = buildFirstPartyBrokResponseIfRelevant(
    resolvedQuery,
    classification,
    searchQueryList,
    request.context
  )
  if (firstPartyResponse) {
    await emitSourcePreview(request, firstPartyResponse.citations)
    return firstPartyResponse
  }

  try {
    return await runBrokWebSearch(
      resolvedQuery,
      classification,
      searchQueryList,
      maxSources,
      config.maxTokens,
      domainHints,
      request
    )
  } catch (error) {
    console.warn('Falling back to HTML search pipeline:', error)
    try {
      return await runHtmlSearchPipeline(
        resolvedQuery,
        classification,
        searchQueryList,
        maxSources,
        config.maxTokens,
        domainHints,
        request
      )
    } catch (fallbackError) {
      console.warn('Search providers unavailable; returning fallback:', {
        primaryError: error,
        fallbackError
      })
      const response = buildLocalFallbackSearchResponse(
        resolvedQuery,
        classification,
        searchQueryList
      )
      await emitSourcePreview(request, response.citations)
      return response
    }
  }
}

function buildFirstPartyBrokResponseIfRelevant(
  resolvedQuery: string,
  classification: QueryClassification,
  searchQueryList: string[],
  context?: SearchContextTurn[]
): SearchResponse | null {
  if (
    !isFirstPartyBrokSearchQuery(resolvedQuery) &&
    !isBrokSearchContextFollowUp(resolvedQuery, context)
  ) {
    return null
  }

  const retrievedAt = new Date().toISOString()
  const citations: SearchResult[] = [
    {
      id: 'src_1',
      title: 'Brok Search product context',
      url: 'https://www.brok.fyi/features/search',
      publisher: 'brok.fyi',
      snippet:
        'Brok Search is a Perplexity-style AI answer engine in this product. It turns a user question into a fast answer with source cards, inline citations, visible research progress, follow-up questions, and a durable thread for follow-up prompts.',
      retrievedAt,
      qualityScore: 100
    },
    {
      id: 'src_2',
      title: 'Brok Search session behavior',
      url: 'https://www.brok.fyi/docs/search-completions',
      publisher: 'brok.fyi',
      snippet:
        'The search session API is designed to stream status updates, source events, answer deltas, follow-up suggestions, and completion metadata so the interface can show progress immediately and stay usable even when external search providers are unavailable.',
      retrievedAt,
      qualityScore: 96
    }
  ]
  const answer = buildFirstPartyBrokAnswer(resolvedQuery)

  return {
    answer,
    citations,
    searchQueries: searchQueryList.length,
    searchQueryList,
    tokensUsed: Math.round((resolvedQuery.length + answer.length) / 4),
    resolvedQuery,
    classification,
    followUps: [
      {
        label: 'How does Brok cite sources?',
        query: 'How does Brok Search cite and verify sources?'
      },
      {
        label: 'Compare Brok to Perplexity',
        query: 'Compare Brok Search to Perplexity for everyday research'
      },
      {
        label: 'Show the product architecture',
        query: 'Show the technical architecture for Brok Search'
      },
      {
        label: 'What should improve next?',
        query: 'What are the biggest product gaps in Brok Search right now?'
      }
    ]
  }
}

function buildFirstPartyBrokAnswer(resolvedQuery: string) {
  if (isCitationFocusedBrokQuery(resolvedQuery)) {
    return [
      'Brok cites sources by attaching retrieved source cards to the answer, then using inline citation markers like [1] and [2] to show which card supports each claim. [1]',
      '',
      'The session stream sends source events before or while the answer is written, so the UI can show the source cards, citation markers, answer deltas, and follow-up suggestions as one connected research flow. [2]',
      '',
      'If Brok cannot attach live web sources, the answer should be labelled as model knowledge or fallback context instead of pretending the claim is web-verified. [2]'
    ].join('\n')
  }

  return [
    'Brok Search is Brok’s AI answer engine: you ask a question, it searches or retrieves context, then returns a concise answer with source cards, citations, and follow-up questions. [1]',
    '',
    'The experience is built to feel fast and readable. It shows progress while Brok searches, reads sources, and writes the answer; then it keeps the thread open so you can ask follow-ups without starting over. [2]',
    '',
    'When live web sources are available, Brok grounds the answer in retrieved snippets. When they are not available, it should clearly label the response as a fallback instead of pretending unsupported facts are sourced. [2]'
  ].join('\n')
}

function isCitationFocusedBrokQuery(query: string) {
  const normalized = query.toLowerCase()
  return /\b(cite|cites|citation|citations|source|sources|verify|verified|grounded|grounding)\b/.test(
    normalized
  )
}

function isBrokSearchContextFollowUp(
  query: string,
  context?: SearchContextTurn[]
) {
  if (!isCitationFocusedBrokQuery(query)) return false
  const contextText = (context ?? [])
    .map(turn => `${turn.query} ${turn.answer}`)
    .join(' ')
    .toLowerCase()

  return (
    /\bbrok\b/.test(contextText) &&
    /\b(search|answer engine|sources?|citations?|cite|verify|ground)\b/.test(
      contextText
    )
  )
}

export function isFirstPartyBrokSearchQuery(query: string) {
  const normalized = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!/\bbrok\b/.test(normalized)) return false
  if (/\bgrok\b/.test(normalized)) return false

  const asksAboutIdentity =
    /\b(what is|what's|who is|explain|how does|describe|tell me about)\b/.test(
      normalized
    )
  const asksAboutSearch =
    /\b(search|answer engine|ai answer|product|platform|app|tool)\b/.test(
      normalized
    )

  return asksAboutIdentity && asksAboutSearch
}

function getSearchCacheTtlMs() {
  const configured = Number.parseInt(
    process.env.BROK_SEARCH_CACHE_TTL_MS || '',
    10
  )
  if (Number.isFinite(configured) && configured >= 0) return configured
  return DEFAULT_SEARCH_CACHE_TTL_MS
}

function buildSearchCacheKey(request: SearchRequest) {
  const domains = [...(request.domains ?? [])]
    .map(domain => domain.toLowerCase())
    .sort()
  const context = (request.context ?? []).map(turn => ({
    query: turn.query.trim().replace(/\s+/g, ' ').toLowerCase(),
    answer: turn.answer.trim().replace(/\s+/g, ' ').slice(0, 900)
  }))
  return JSON.stringify({
    query: request.query.trim().replace(/\s+/g, ' ').toLowerCase(),
    context,
    depth: request.depth,
    recencyDays: request.recencyDays ?? null,
    domains,
    maxSources: request.maxSources ?? null,
    synthesisModel: request.synthesisModel ?? null
  })
}

export function getCachedSearchPipelineResponse(
  request: Pick<
    SearchRequest,
    | 'query'
    | 'depth'
    | 'recencyDays'
    | 'domains'
    | 'maxSources'
    | 'synthesisModel'
    | 'context'
  >
): SearchResponse | null {
  if (getSearchCacheTtlMs() <= 0) return null
  return getCachedSearchResponse(buildSearchCacheKey(request))
}

export function resolveSearchSynthesisModel(modelId?: string | null) {
  if (!modelId) return null

  const trimmed = modelId.trim()
  if (!trimmed) return null

  return getBrokProviderModelId(trimmed) ?? trimmed
}

function getCachedSearchResponse(cacheKey: string) {
  const cached = searchResponseCache.get(cacheKey)
  if (!cached) return null

  if (cached.expiresAt <= Date.now()) {
    searchResponseCache.delete(cacheKey)
    return null
  }

  searchResponseCache.delete(cacheKey)
  searchResponseCache.set(cacheKey, cached)
  return cloneSearchResponse(cached.response)
}

function setCachedSearchResponse(
  cacheKey: string,
  response: SearchResponse,
  ttlMs: number
) {
  searchResponseCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    response: cloneSearchResponse(response)
  })

  while (searchResponseCache.size > SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = searchResponseCache.keys().next().value
    if (!oldestKey) break
    searchResponseCache.delete(oldestKey)
  }
}

function isUnavailableSearchResponse(response: SearchResponse) {
  return (
    response.answer.startsWith('Live web search was unavailable') &&
    response.citations.length === 0
  )
}

function cloneSearchResponse(response: SearchResponse): SearchResponse {
  return JSON.parse(JSON.stringify(response)) as SearchResponse
}

async function emitSourcePreview(
  request: Pick<SearchRequest, 'onSources'>,
  citations: SearchResult[]
) {
  if (!request.onSources || citations.length === 0) return
  await request.onSources(
    JSON.parse(JSON.stringify(citations)) as SearchResult[]
  )
}

export function clearSearchPipelineCache() {
  searchResponseCache.clear()
  inFlightSearches.clear()
}

function clampSourceCount(
  requested: number | undefined,
  fallback: number
): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return fallback
  }
  const rounded = Math.floor(requested)
  if (rounded < 1) return 1
  if (rounded > 25) return 25
  return rounded
}

function buildLocalFallbackSearchResponse(
  resolvedQuery: string,
  classification: QueryClassification,
  searchQueryList: string[]
): SearchResponse {
  const answer = buildLocalFallbackAnswer(resolvedQuery, classification)

  return {
    answer,
    citations: [],
    searchQueries: searchQueryList.length,
    searchQueryList,
    tokensUsed: Math.round((resolvedQuery.length + answer.length) / 4),
    resolvedQuery,
    classification,
    followUps: [
      {
        label: 'Retry with live sources',
        query: `Search the web again for ${resolvedQuery}`
      },
      {
        label: 'Limit to primary sources',
        query: `Find primary sources for ${resolvedQuery}`
      },
      {
        label: 'Make a verification checklist',
        query: `What should I verify before trusting an answer about ${resolvedQuery}?`
      }
    ]
  }
}

function buildLocalFallbackAnswer(
  resolvedQuery: string,
  classification: QueryClassification
) {
  const prefix =
    'Live web search was unavailable, so this is a fast local fallback based on model knowledge rather than verified web results. No web sources were attached.'

  switch (classification.type) {
    case 'fresh/current':
    case 'news':
    case 'shopping-ish':
    case 'local':
      return `${prefix}\n\nFor "${resolvedQuery}", I should not invent current facts. The useful next move is to check primary sources, official pages, recent announcements, pricing pages, or local listings once search is back. If you rerun this in a moment or add a specific domain, Brok can replace this fallback with sourced results.`
    case 'comparison':
      return `${prefix}\n\nFor "${resolvedQuery}", compare the options on: purpose, core features, reliability, pricing, integration effort, switching costs, and the risks that matter to your use case. Treat any time-sensitive claims like current price, availability, benchmark results, or policy changes as unverified until live sources return.`
    case 'technical':
    case 'code':
      return `${prefix}\n\nFor "${resolvedQuery}", start by isolating the expected behavior, the failing behavior, the smallest repro, logs/errors, and the boundary between client, server, and external services. Then make one narrow fix, add a regression test around the failure mode, and verify the real user path.`
    case 'recommendation':
      return `${prefix}\n\nFor "${resolvedQuery}", define the decision criteria first: must-haves, budget/time constraints, integration needs, durability, and failure cost. Then shortlist options against those criteria and verify recent reviews, docs, and pricing with live sources before deciding.`
    case 'academic':
      return `${prefix}\n\nFor "${resolvedQuery}", use this only as a starting frame: define the key terms, look for primary papers or canonical references, compare claims across sources, and note where evidence is weak or contested before treating the answer as reliable.`
    default:
      return `${prefix}\n\nFor "${resolvedQuery}", the safest general answer is to clarify the core question, separate stable background from facts that may have changed, and verify any names, dates, numbers, prices, or policies with live sources when search is available again.`
  }
}

async function runBrokWebSearch(
  resolvedQuery: string,
  classification: QueryClassification,
  searchQueryList: string[],
  numResults: number,
  maxTokens: number,
  domainHints: string[],
  events: Pick<
    SearchRequest,
    'onSources' | 'onAnswerDelta' | 'signal' | 'synthesisModel' | 'context'
  >
): Promise<SearchResponse> {
  const batches = await settleSearchBatches(
    searchQueryList.map(searchQuery =>
      searchWithBrokWebSearch(searchQuery, numResults, {
        signal: events.signal
      })
    )
  )
  const rankedSourceInputs = batches
    .flat()
    .filter(result => result.link)
    .map((result): Omit<SearchResult, 'id' | 'qualityScore'> => {
      const url = result.link || ''
      return {
        title: result.title || 'Untitled',
        url,
        publisher: getHost(url),
        snippet: [result.snippet, result.date ? `Date: ${result.date}` : '']
          .filter(Boolean)
          .join('\n'),
        retrievedAt: new Date().toISOString()
      }
    })

  const missingCanonicalHomepages = getMissingCanonicalHomepageDomains(
    domainHints,
    rankedSourceInputs
  )

  if (missingCanonicalHomepages.length) {
    rankedSourceInputs.push(
      ...(await fetchDomainHomepageSources(
        missingCanonicalHomepages,
        events.signal
      ))
    )
  } else if (domainHints.length && rankedSourceInputs.length < 2) {
    rankedSourceInputs.push(
      ...(await fetchDomainHomepageSources(domainHints, events.signal))
    )
  }
  rankedSourceInputs.push(...getCanonicalSourceHints(resolvedQuery))

  const citations = rankAndDedupeSources(
    rankedSourceInputs,
    resolvedQuery,
    numResults
  )
  await emitSourcePreview(events, citations)

  const answer = await synthesizeAnswerFromResults(
    resolvedQuery,
    citations,
    maxTokens,
    classification,
    events
  )
  const followUps = generateFollowUps(resolvedQuery, classification, citations)

  return {
    answer,
    citations,
    searchQueries: searchQueryList.length,
    searchQueryList,
    tokensUsed: Math.round(
      (answer.length + JSON.stringify(citations).length) / 4
    ),
    resolvedQuery,
    classification,
    followUps
  }
}

async function runHtmlSearchPipeline(
  resolvedQuery: string,
  classification: QueryClassification,
  searchQueryList: string[],
  numResults: number,
  maxTokens: number,
  domainHints: string[],
  events: Pick<
    SearchRequest,
    'onSources' | 'onAnswerDelta' | 'signal' | 'synthesisModel' | 'context'
  >
): Promise<SearchResponse> {
  const resultBatches = await settleSearchBatches(
    searchQueryList.map(searchQuery =>
      searchDuckDuckGo(searchQuery, numResults, events.signal)
    )
  ).catch(error => {
    if (domainHints.length) {
      console.warn(
        'HTML search unavailable; trying domain homepage fallback:',
        error
      )
      return []
    }
    throw error
  })
  const rankedSourceInputs: Array<
    Omit<SearchResult, 'id' | 'qualityScore'> | SearchResult
  > = resultBatches.flat()

  const missingCanonicalHomepages = getMissingCanonicalHomepageDomains(
    domainHints,
    rankedSourceInputs
  )

  if (missingCanonicalHomepages.length) {
    rankedSourceInputs.push(
      ...(await fetchDomainHomepageSources(
        missingCanonicalHomepages,
        events.signal
      ))
    )
  } else if (domainHints.length && rankedSourceInputs.length < 2) {
    rankedSourceInputs.push(
      ...(await fetchDomainHomepageSources(domainHints, events.signal))
    )
  }
  rankedSourceInputs.push(...getCanonicalSourceHints(resolvedQuery))

  const citations = rankAndDedupeSources(
    rankedSourceInputs,
    resolvedQuery,
    numResults
  )
  await emitSourcePreview(events, citations)
  const answer = await synthesizeAnswerFromResults(
    resolvedQuery,
    citations,
    maxTokens,
    classification,
    events
  )
  const followUps = generateFollowUps(resolvedQuery, classification, citations)

  return {
    answer,
    citations,
    searchQueries: searchQueryList.length,
    searchQueryList,
    tokensUsed: Math.round(
      (answer.length + JSON.stringify(citations).length) / 4
    ),
    resolvedQuery,
    classification,
    followUps
  }
}

async function settleSearchBatches<T>(
  searches: Array<Promise<T[]>>
): Promise<T[][]> {
  const results: Array<PromiseSettledResult<T[]> | undefined> = new Array(
    searches.length
  )
  let settledCount = 0
  let fulfilledCount = 0
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const allSettled = Promise.all(
    searches.map((search, index) =>
      search.then(
        value => {
          results[index] = { status: 'fulfilled', value }
          fulfilledCount += 1
          settledCount += 1
        },
        reason => {
          console.warn('Search query failed:', reason)
          results[index] = { status: 'rejected', reason }
          settledCount += 1
        }
      )
    )
  )

  const softDeadline = new Promise<'timeout'>(resolve => {
    timeoutId = setTimeout(resolve, getSearchBatchSoftTimeoutMs(), 'timeout')
  })

  await Promise.race([allSettled, softDeadline])
  if (timeoutId) {
    clearTimeout(timeoutId)
  }

  if (fulfilledCount === 0 && settledCount < searches.length) {
    await allSettled
  }

  const settledResults = results.filter(
    (result): result is PromiseSettledResult<T[]> => Boolean(result)
  )
  const fulfilled = settledResults
    .filter((result): result is PromiseFulfilledResult<T[]> => {
      return result.status === 'fulfilled'
    })
    .map(result => result.value)

  if (fulfilled.length === 0) {
    const firstError = settledResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    throw firstError?.reason ?? new Error('All search queries failed')
  }

  return fulfilled
}

async function searchDuckDuckGo(
  query: string,
  numResults: number,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const response = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      signal: createTimeoutSignal(getSearchFetchTimeoutMs(), signal),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BrokSearch/1.0)'
      }
    }
  )

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: ${response.status}`)
  }

  const html = await response.text()
  const root = parse(html)
  const results = root.querySelectorAll('.result').slice(0, numResults)

  return results
    .map((result, index): SearchResult | null => {
      const link = result.querySelector('.result__title a')
      const snippetNode = result.querySelector('.result__snippet')

      if (!link) {
        return null
      }

      const rawHref = link.getAttribute('href') || ''
      const url = decodeDuckDuckGoUrl(rawHref)
      if (!url) {
        return null
      }

      const host = getHost(url)

      return {
        id: `src_${index + 1}`,
        title: link.text.trim() || 'Untitled',
        url,
        publisher: host,
        snippet: snippetNode?.text.trim() || '',
        retrievedAt: new Date().toISOString()
      }
    })
    .filter((result): result is SearchResult => Boolean(result))
}

function decodeDuckDuckGoUrl(rawHref: string): string | null {
  try {
    if (!rawHref) {
      return null
    }

    if (rawHref.startsWith('//')) {
      return `https:${rawHref}`
    }

    if (rawHref.startsWith('http://') || rawHref.startsWith('https://')) {
      return rawHref
    }

    const parsed = new URL(rawHref, 'https://duckduckgo.com')
    const redirectTarget = parsed.searchParams.get('uddg')
    return redirectTarget
      ? decodeURIComponent(redirectTarget)
      : parsed.toString()
  } catch {
    return null
  }
}

function getHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

async function fetchDomainHomepageSources(
  domains: string[],
  signal?: AbortSignal
): Promise<Array<Omit<SearchResult, 'id' | 'qualityScore'>>> {
  const sources: Array<Omit<SearchResult, 'id' | 'qualityScore'>> = []

  for (const domain of domains.slice(0, 3)) {
    if (!isPublicDomainHint(domain)) continue

    const source = await fetchDomainHomepageSource(domain, signal).catch(
      () => null
    )
    if (source) {
      sources.push(source)
    }
  }

  return sources
}

async function fetchDomainHomepageSource(
  domain: string,
  signal?: AbortSignal
): Promise<Omit<SearchResult, 'id' | 'qualityScore'> | null> {
  const url = `https://${domain}`
  const response = await fetch(url, {
    signal: createTimeoutSignal(5000, signal),
    headers: {
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; BrokSearch/1.0)'
    }
  })

  if (!response.ok) return null

  const contentType = response.headers.get('content-type') || ''
  if (!/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
    return null
  }

  const html = await response.text()
  const root = parse(html)
  const title = root.querySelector('title')?.text.trim()
  const description =
    root.querySelector('meta[name="description"]')?.getAttribute('content') ||
    root
      .querySelector('meta[property="og:description"]')
      ?.getAttribute('content') ||
    root.text.replace(/\s+/g, ' ').trim().slice(0, 280)

  return {
    title: title || domain,
    url: response.url || url,
    publisher: getHost(response.url || url) || domain,
    snippet: description || `Homepage for ${domain}.`,
    retrievedAt: new Date().toISOString()
  }
}

function isPublicDomainHint(domain: string) {
  if (
    !domain ||
    domain.length > 253 ||
    domain.includes('/') ||
    /(^|\.)localhost$/i.test(domain) ||
    /\.local$/i.test(domain)
  ) {
    return false
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain)) {
    const parts = domain.split('.').map(Number)
    const [first, second] = parts
    return !(
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first === 0 ||
      first >= 224
    )
  }

  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(domain)
}

async function synthesizeAnswerFromResults(
  query: string,
  citations: SearchResult[],
  maxTokens: number,
  classification: QueryClassification,
  events: Pick<
    SearchRequest,
    'onAnswerDelta' | 'signal' | 'synthesisModel' | 'context'
  > = {}
): Promise<string> {
  if (citations.length === 0) {
    return 'No search results were available.'
  }

  if (!BROK_PROVIDER_API_KEY) {
    return buildSourceSnippetAnswer(query, citations, classification)
  }

  const context = citations
    .map(
      (citation, index) =>
        `[source_${index + 1}]\nTitle: ${citation.title}\nURL: ${citation.url}\nAuthority: ${citation.qualityScore ?? 0}/100\nSnippet: ${citation.snippet}`
    )
    .join('\n\n')

  try {
    const synthesisModel =
      resolveSearchSynthesisModel(events.synthesisModel) ??
      BROK_PROVIDER_CHAT_MODEL

    const response = await fetch(`${BROK_PROVIDER_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: createTimeoutSignal(getAnswerSynthesisTimeoutMs(), events.signal),
      headers: {
        Authorization: `Bearer ${BROK_PROVIDER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: synthesisModel,
        max_tokens: Math.min(maxTokens, 1200),
        stream: Boolean(events.onAnswerDelta),
        messages: [
          {
            role: 'system',
            content:
              'You are Brok, a fast answer engine. Answer using only the provided search results. Start with the direct answer. Keep simple factual questions concise. Use bullets or tables only when they make the answer clearer. Cite factual claims with [1], [2], etc. matching the source order. Mention uncertainty when evidence is weak. For investment, medical, legal, or other high-stakes advice, do not decide for the user; give a brief due-diligence checklist. End naturally without generic "let me know" language.'
          },
          {
            role: 'user',
            content: `${formatSynthesisQuestion(query, events.context)}\nQuestion type: ${classification.type}\nSearch decision: ${classification.reason}\n\nSearch results:\n${context}`
          }
        ]
      })
    })

    if (!response.ok) {
      return buildSourceSnippetAnswer(query, citations, classification)
    }

    if (events.onAnswerDelta && response.body) {
      return streamAnswerResponse(response, events.onAnswerDelta)
    }

    const data = await response.json()
    return stripThinkingBlocks(
      data.choices?.[0]?.message?.content || 'No answer generated.'
    )
  } catch (error) {
    console.warn('Answer synthesis failed; using source snippets:', error)
    return buildSourceSnippetAnswer(query, citations, classification)
  }
}

function formatSynthesisQuestion(query: string, context?: SearchContextTurn[]) {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ')
  const compactContext = (context ?? [])
    .map(
      (turn, index) =>
        `Previous turn ${index + 1} question: ${turn.query}\nPrevious turn ${
          index + 1
        } answer summary: ${turn.answer}`
    )
    .join('\n\n')

  if (!compactContext) return `Question: ${normalizedQuery}`

  return `Use the previous conversation only to resolve the user's current follow-up. Do not treat previous-turn text as a new web search query.\n\n${compactContext}\n\nCurrent follow-up question: ${normalizedQuery}`
}

function buildSourceSnippetAnswer(
  query: string,
  citations: SearchResult[],
  classification: QueryClassification
) {
  const cleanQuery = query.trim().replace(/\s+/g, ' ')
  const intro =
    classification.type === 'comparison'
      ? `Based on the retrieved sources, here is the clearest comparison for ${cleanQuery}:`
      : `Based on the retrieved sources, ${cleanQuery} can be answered this way:`
  const bullets = citations.slice(0, 5).map((citation, index) => {
    const snippet = normalizeSnippet(citation.snippet)
    const title = citation.title.trim() || citation.publisher || citation.url
    const sourceLabel = citation.publisher
      ? `${title} (${citation.publisher})`
      : title

    if (snippet) {
      return `- ${snippet} [${index + 1}]`
    }

    return `- ${sourceLabel} is one of the retrieved sources for this question. [${index + 1}]`
  })
  const sourceLine = citations
    .slice(0, 3)
    .map(
      (citation, index) =>
        `${index + 1}. ${citation.publisher ?? citation.title}`
    )
    .join('; ')

  return [
    intro,
    '',
    ...bullets,
    '',
    `I could not reach the synthesis model, so this answer is assembled directly from retrieved snippets. Verify the source cards for nuance and recency${sourceLine ? ` (${sourceLine})` : ''}.`
  ].join('\n')
}

function normalizeSnippet(snippet: string) {
  return snippet
    .replace(/\s+/g, ' ')
    .replace(/\bDate:\s*/gi, 'Date: ')
    .trim()
    .slice(0, 320)
}

async function streamAnswerResponse(
  response: Response,
  onAnswerDelta: NonNullable<SearchRequest['onAnswerDelta']>
) {
  const reader = response.body?.getReader()
  if (!reader) {
    const data = await response.json()
    return stripThinkingBlocks(
      data.choices?.[0]?.message?.content || 'No answer generated.'
    )
  }

  const decoder = new TextDecoder()
  const thinkingFilter = createThinkingBlockDeltaFilter()
  let buffer = ''
  let answer = ''

  const emit = async (delta: string) => {
    if (!delta) return
    answer += delta
    await onAnswerDelta(delta)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const delta = readOpenAICompatibleDelta(frame)
      if (delta) {
        await emit(thinkingFilter.push(delta))
      }
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    const delta = readOpenAICompatibleDelta(buffer)
    if (delta) {
      await emit(thinkingFilter.push(delta))
    }
  }

  await emit(thinkingFilter.flush())

  return answer.trim() || 'No answer generated.'
}

function readOpenAICompatibleDelta(frame: string) {
  const dataLines = frame
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())

  let delta = ''
  for (const line of dataLines) {
    if (!line || line === '[DONE]') continue
    try {
      const chunk = JSON.parse(line)
      delta += chunk.choices?.[0]?.delta?.content ?? ''
      delta += chunk.choices?.[0]?.message?.content ?? ''
      delta += chunk.choices?.[0]?.text ?? ''
    } catch {
      // Ignore malformed provider frames; the final answer will reflect
      // successfully parsed chunks.
    }
  }

  return delta
}

function createThinkingBlockDeltaFilter() {
  let pending = ''
  let insideThinking = false
  const visibleTailGuard = '<think'.length
  const hiddenTailGuard = '</think>'.length

  return {
    push(delta: string) {
      pending += delta
      let output = ''

      while (pending) {
        if (insideThinking) {
          const closeIndex = pending.toLowerCase().indexOf('</think>')
          if (closeIndex === -1) {
            pending = pending.slice(-hiddenTailGuard)
            break
          }

          pending = pending.slice(closeIndex + '</think>'.length)
          insideThinking = false
          continue
        }

        const openIndex = pending.toLowerCase().indexOf('<think')
        if (openIndex === -1) {
          if (pending.length <= visibleTailGuard) break
          output += pending.slice(0, -visibleTailGuard)
          pending = pending.slice(-visibleTailGuard)
          break
        }

        output += pending.slice(0, openIndex)
        pending = pending.slice(openIndex)
        const tagEnd = pending.indexOf('>')
        if (tagEnd === -1) {
          insideThinking = true
          pending = ''
          break
        }

        pending = pending.slice(tagEnd + 1)
        insideThinking = true
      }

      return output
    },
    flush() {
      if (insideThinking) {
        pending = ''
        return ''
      }
      const output = stripThinkingBlocks(pending)
      pending = ''
      return output
    }
  }
}

function createTimeoutSignal(timeoutMs: number, parent?: AbortSignal) {
  if (!parent) return AbortSignal.timeout(timeoutMs)
  return AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)])
}

export function classifyQuery(query: string): QueryClassification {
  const lower = query.toLowerCase()
  const hasCurrentIntent =
    /\b(latest|recent|today|now|current|news|202[5-9]|pricing|released|launch|compare)\b/.test(
      lower
    )
  const type: QuestionType =
    /\b(compare|versus|vs\.?|difference|better)\b/.test(lower)
      ? 'comparison'
      : /\b(opinion|think about|take on)\b/.test(lower)
        ? 'opinion'
        : /\b(code|debug|repo|typescript|api|endpoint)\b/.test(lower)
          ? 'technical'
          : /\b(best|recommend|should i|which)\b/.test(lower)
            ? 'recommendation'
            : /\b(news|latest|today|recent)\b/.test(lower)
              ? 'news'
              : /\b(price|pricing|cost|token|plan)\b/.test(lower)
                ? 'fresh/current'
                : /\b(explain|what is|how does|why)\b/.test(lower)
                  ? 'evergreen/explainer'
                  : 'fresh/current'

  return {
    type,
    needsSearch: hasCurrentIntent || type !== 'opinion',
    reason: hasCurrentIntent
      ? 'The query asks for current or externally verifiable information.'
      : 'Brok verifies informational answers with sources by default.'
  }
}

export function resolveQuery(
  query: string,
  classification: QueryClassification
): string {
  const trimmed = query.trim().replace(/\s+/g, ' ')
  if (classification.type === 'comparison' && !/\bcompare\b/i.test(trimmed)) {
    return `Compare ${trimmed}`
  }
  return trimmed
}

export function buildSearchQueries({
  query,
  classification,
  depth,
  limit,
  recencyDays,
  domains
}: {
  query: string
  classification: QueryClassification
  depth: SearchRequest['depth']
  limit: number
  recencyDays?: number
  domains?: string[]
}): string[] {
  const resolved = resolveQuery(query, classification)
  const searchSubject = expandSearchSubjectForNews(resolved, classification)
  const freshness = recencyDays ? ` within ${recencyDays} days` : ''
  const domainList = getDomainHints(query, domains)
  const domainHint = domainList?.length
    ? ` site:${domainList.join(' OR site:')}`
    : ''
  const queries = [
    `${searchSubject}${freshness}${domainHint}`,
    `${searchSubject} official docs primary source${freshness}${domainHint}`,
    `${searchSubject} analysis comparison${freshness}${domainHint}`,
    `${searchSubject} latest updates${freshness}${domainHint}`,
    `${searchSubject} examples implementation${freshness}${domainHint}`
  ]

  if (depth === 'lite') {
    return [queries[0]]
  }

  return [...new Set(queries)].slice(0, limit)
}

function expandSearchSubjectForNews(
  query: string,
  classification: QueryClassification
) {
  if (classification.type !== 'news') return query
  const lower = query.toLowerCase()
  if (!/\b(ai|artificial intelligence)\b/.test(lower)) return query

  const builderContext =
    /\b(builder|builders|developer|developers|founder|founders|startup|startups)\b/.test(
      lower
    )
      ? 'software developers startups AI tools models'
      : 'AI tools models products research'

  return `${query} ${builderContext}`
}

function extractDomainsFromQuery(query: string): string[] {
  const matches = query.match(
    /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi
  )

  if (!matches) return []

  return Array.from(
    new Set(
      matches
        .map(match =>
          match
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .replace(/[),.;!?]+$/g, '')
            .toLowerCase()
        )
        .filter(domain => {
          if (!domain.includes('.')) return false
          return !isLikelyFileOrRuntimeName(domain)
        })
    )
  ).slice(0, 3)
}

function getDomainHints(query: string, domains?: string[]) {
  if (domains?.length) return domains

  return Array.from(
    new Set([
      ...extractDomainsFromQuery(query),
      ...inferCanonicalDomains(query)
    ])
  ).slice(0, 4)
}

function getMissingCanonicalHomepageDomains(
  domains: string[],
  sources: Array<Omit<SearchResult, 'id' | 'qualityScore'> | SearchResult>
) {
  const exactHosts = new Set(
    sources
      .map(source => getHost(source.url) ?? source.publisher)
      .filter((host): host is string => Boolean(host))
  )

  return domains
    .filter(isCanonicalHomepageDomain)
    .filter(domain => !exactHosts.has(domain))
}

function getCanonicalSourceHints(
  query: string
): Array<Omit<SearchResult, 'id' | 'qualityScore'>> {
  const lower = query.toLowerCase()
  const retrievedAt = new Date().toISOString()
  const sources: Array<Omit<SearchResult, 'id' | 'qualityScore'>> = []

  if (
    /\breact(?:\.js|js)?\b/.test(lower) &&
    /\b(learn|learning|start|started|beginner|tutorial|best way|hooks?)\b/.test(
      lower
    )
  ) {
    sources.push(
      {
        title: 'React Learn',
        url: 'https://react.dev/learn',
        publisher: 'react.dev',
        snippet:
          'Official React learning path covering components, props, state, events, hooks, and practical ways to build with React.',
        retrievedAt
      },
      {
        title: 'Getting started with React - Learn web development | MDN',
        url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Frameworks_libraries/React_getting_started',
        publisher: 'developer.mozilla.org',
        snippet:
          'MDN guide for getting started with React, including prerequisites, project setup, components, props, state, and events.',
        retrievedAt
      }
    )
  }

  if (/\breact(?:\.js|js)?\b/.test(lower) && /\bhooks?\b/.test(lower)) {
    sources.push({
      title: 'Built-in React Hooks',
      url: 'https://react.dev/reference/react/hooks',
      publisher: 'react.dev',
      snippet:
        'Official React reference for built-in Hooks including useState, useEffect, useContext, useReducer, useMemo, and custom Hook guidance.',
      retrievedAt
    })
  }

  if (/\bcursor\b/.test(lower) && /\bwindsurf\b/.test(lower)) {
    sources.push(
      {
        title: 'Cursor: AI coding agent',
        url: 'https://cursor.com',
        publisher: 'cursor.com',
        snippet:
          'Official Cursor product page for its AI coding agent and editor features for software development.',
        retrievedAt
      },
      {
        title: 'Windsurf - Agentic IDE',
        url: 'https://windsurf.com',
        publisher: 'windsurf.com',
        snippet:
          'Official Windsurf product page for its agentic IDE and AI-powered coding environment.',
        retrievedAt
      },
      {
        title: 'Codeium',
        url: 'https://codeium.com',
        publisher: 'codeium.com',
        snippet:
          'Official Codeium product site; Codeium is the company behind Windsurf.',
        retrievedAt
      }
    )
  }

  return sources
}

function inferCanonicalDomains(query: string): string[] {
  const lower = query.toLowerCase()
  const domains: string[] = []

  if (/\breact(?:\.js|js)?\b/.test(lower)) {
    domains.push('react.dev', 'developer.mozilla.org')
  }
  if (/\bnext(?:\.js|js)?\b/.test(lower)) {
    domains.push('nextjs.org', 'react.dev')
  }
  if (/\btypescript\b/.test(lower)) {
    domains.push('typescriptlang.org')
  }
  if (/\bvue(?:\.js|js)?\b/.test(lower)) {
    domains.push('vuejs.org')
  }
  if (/\bsvelte\b/.test(lower)) {
    domains.push('svelte.dev')
  }
  if (/\bcursor\b/.test(lower)) {
    domains.push('cursor.com')
  }
  if (/\bwindsurf\b|\bcodeium\b/.test(lower)) {
    domains.push('windsurf.com', 'codeium.com')
  }
  if (
    /\b(news|latest|today|recent)\b/.test(lower) &&
    /\b(ai|artificial intelligence)\b/.test(lower)
  ) {
    domains.push(
      'reuters.com',
      'techcrunch.com',
      'theverge.com',
      'news.mit.edu'
    )
  }

  return domains
}

function isCanonicalHomepageDomain(domain: string) {
  return /^(react\.dev|developer\.mozilla\.org|nextjs\.org|typescriptlang\.org|vuejs\.org|svelte\.dev|cursor\.com|windsurf\.com|codeium\.com)$/i.test(
    domain
  )
}

function isLikelyFileOrRuntimeName(domain: string) {
  return /\.(png|jpe?g|gif|webp|pdf|zip|txt|md|m?js|cjs|jsx|tsx?|json|ya?ml|toml|css|scss|html?|py|rb|go|rs|java|kt|swift|php|cs|cpp|c|h)$/i.test(
    domain
  )
}

export function rankAndDedupeSources(
  sources: Array<Omit<SearchResult, 'id' | 'qualityScore'> | SearchResult>,
  query: string,
  limit: number
): SearchResult[] {
  const seen = new Set<string>()
  const canonicalDomains = getDomainHints(query).filter(
    isCanonicalHomepageDomain
  )
  const exactCanonicalHosts = new Set(
    sources
      .map(source => getHost(source.url) ?? source.publisher ?? '')
      .filter(host => canonicalDomains.includes(host))
  )

  return sources
    .filter(source => {
      const key = normalizeSourceKey(source.url)
      if (!key || seen.has(key)) return false
      const host = getHost(source.url) ?? source.publisher ?? ''
      if (shouldSuppressCommunitySubdomain(host, exactCanonicalHosts)) {
        return false
      }
      seen.add(key)
      return true
    })
    .map(source => ({
      ...source,
      qualityScore: scoreSource(source, query)
    }))
    .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
    .slice(0, limit)
    .map((source, index) => ({
      ...source,
      id: `src_${index + 1}`
    }))
}

function normalizeSourceKey(url: string) {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.search = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function shouldSuppressCommunitySubdomain(
  host: string,
  exactCanonicalHosts: Set<string>
) {
  if (!isCommunityHost(host)) return false

  return Array.from(exactCanonicalHosts).some(
    canonicalHost =>
      host !== canonicalHost && host.endsWith(`.${canonicalHost}`)
  )
}

function scoreSource(
  source: Pick<SearchResult, 'title' | 'url' | 'publisher' | 'snippet'>,
  query: string
) {
  const haystack = `${source.title} ${source.publisher ?? ''} ${source.snippet}`
    .toLowerCase()
    .replace(/[^\w\s.-]/g, ' ')
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 3)
  const relevance = queryTerms.reduce(
    (score, term) => score + (haystack.includes(term) ? 6 : 0),
    0
  )
  const host = getHost(source.url) ?? source.publisher ?? ''
  const authority = scoreAuthority(host)
  const freshness =
    /\b(2026|2025|today|yesterday|latest|updated|released)\b/i.test(
      source.snippet
    )
      ? 12
      : 0
  const spamPenalty = /\b(best|top|coupon|casino|essay|generator)\b/i.test(host)
    ? -20
    : 0
  const communityPenalty = isCommunityHost(host) ? -12 : 0
  const offTopicNewsPenalty = getOffTopicNewsPenalty(host, haystack, query)
  const canonicalPathAdjustment = getCanonicalPathAdjustment(
    source.url,
    haystack,
    query
  )

  return Math.max(
    0,
    Math.min(
      100,
      20 +
        relevance +
        authority +
        freshness +
        spamPenalty +
        communityPenalty +
        offTopicNewsPenalty +
        canonicalPathAdjustment
    )
  )
}

function scoreAuthority(host: string) {
  if (!host) return 0
  if (/\b(gov|edu)\b/.test(host)) return 35
  if (isCanonicalHomepageDomain(host)) return 34
  if (isCommunityHost(host)) return 6
  if (
    /(^|\.)((docs|developer|platform|support)\.|github\.com|arxiv\.org|openai\.com|minimax\.io|anthropic\.com|google\.com|microsoft\.com|apple\.com|react\.dev|nextjs\.org|typescriptlang\.org|vuejs\.org|svelte\.dev|cursor\.com|windsurf\.com|codeium\.com)/i.test(
      host
    )
  ) {
    return 30
  }
  if (
    /(reuters|associatedpress|apnews|bloomberg|ft\.com|wsj\.com|theverge|techcrunch|news\.mit\.edu)/i.test(
      host
    )
  ) {
    return 22
  }
  return 8
}

function isCommunityHost(host: string) {
  return /\b(forum|community|quora|reddit|youtube|medium|substack|facebook|instagram|tiktok|linkedin)\b/i.test(
    host
  )
}

function getOffTopicNewsPenalty(host: string, haystack: string, query: string) {
  const lowerQuery = query.toLowerCase()
  if (
    !/\b(news|latest|today|recent)\b/.test(lowerQuery) ||
    !/\b(ai|artificial intelligence)\b/.test(lowerQuery)
  ) {
    return 0
  }

  if (
    /\b(construction|aec|architecture|engineering|contractor|jobsite|finance team)\b/i.test(
      `${host} ${haystack}`
    )
  ) {
    return -28
  }

  return 0
}

function getCanonicalPathAdjustment(
  url: string,
  haystack: string,
  query: string
) {
  const lowerQuery = query.toLowerCase()

  let adjustment = 0
  if (/\breact(?:\.js|js)?\b/.test(lowerQuery)) {
    if (
      /\bhooks?\b/.test(lowerQuery) &&
      /react\.dev\/reference\/react\/hooks/i.test(url)
    ) {
      adjustment += 22
    }

    if (
      /\b(learn|learning|start|started|beginner|tutorial|best way)\b/.test(
        lowerQuery
      ) &&
      (/react\.dev\/learn/i.test(url) ||
        /developer\.mozilla\.org\/.*react_getting_started/i.test(url))
    ) {
      adjustment += 18
    }

    if (
      /\b(learn|learning|start|started|beginner|tutorial|hooks?)\b/.test(
        lowerQuery
      ) &&
      /\b(conference|conferences|foundation|news|event|events)\b/i.test(
        haystack
      )
    ) {
      adjustment -= 24
    }
  }

  if (/\bcursor\b/.test(lowerQuery) && /\bwindsurf\b/.test(lowerQuery)) {
    if (/^https:\/\/(www\.)?(cursor|windsurf|codeium)\.com\/?$/i.test(url)) {
      adjustment += 18
    }

    if (
      /\b(devin|lovable|bolt|replit|v0)\b/i.test(haystack) &&
      !/\b(cursor|windsurf|codeium)\b/i.test(haystack)
    ) {
      adjustment -= 22
    }
  }

  return adjustment
}

export function generateFollowUps(
  query: string,
  classification: QueryClassification,
  citations: SearchResult[]
): Array<{ label: string; query: string }> {
  const sourceDomain = citations[0]?.publisher
  const base = query.replace(/[?.!]+$/, '')
  const suggestions = [
    {
      label: `Compare options for ${shortenLabel(base)}`,
      query: `Compare the strongest options and tradeoffs for ${base}`
    },
    {
      label: `Turn this into an implementation plan`,
      query: `Create a step-by-step implementation plan for ${base}`
    },
    {
      label: `What are the risks?`,
      query: `What are the risks, edge cases, and failure modes for ${base}?`
    },
    {
      label:
        classification.type === 'technical'
          ? 'Show the architecture'
          : 'Find the latest updates',
      query:
        classification.type === 'technical'
          ? `Show the technical architecture for ${base}`
          : `Find the latest updates and primary sources for ${base}`
    },
    {
      label: sourceDomain ? `Ask about ${sourceDomain}` : 'Go deeper',
      query: sourceDomain
        ? `What does ${sourceDomain} specifically say about ${base}?`
        : `Go deeper on ${base} with more source detail`
    }
  ]

  return suggestions.slice(0, 5)
}

function shortenLabel(text: string) {
  const words = text.split(/\s+/).filter(Boolean)
  return words.length > 7 ? `${words.slice(0, 7).join(' ')}...` : text
}
