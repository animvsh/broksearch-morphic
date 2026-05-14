import { parse } from 'node-html-parser'

import {
  MINIMAX_API_KEY,
  MINIMAX_BASE_URL,
  MINIMAX_CHAT_MODEL
} from '@/lib/ai/minimax'
import { searchWithMiniMaxWebSearch } from '@/lib/brok/minimax-web-search'
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

export interface SearchRequest {
  query: string
  depth: 'lite' | 'standard' | 'deep'
  recencyDays?: number
  domains?: string[]
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

export async function runSearchPipeline(
  request: SearchRequest
): Promise<SearchResponse> {
  const config = SEARCH_CONFIG[request.depth]
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

  try {
    return await runMiniMaxWebSearch(
      resolvedQuery,
      classification,
      searchQueryList,
      config.sources,
      config.maxTokens
    )
  } catch (error) {
    console.warn('Falling back to HTML search pipeline:', error)
    return runHtmlSearchPipeline(
      resolvedQuery,
      classification,
      searchQueryList,
      config.sources,
      config.maxTokens
    )
  }
}

async function runMiniMaxWebSearch(
  resolvedQuery: string,
  classification: QueryClassification,
  searchQueryList: string[],
  numResults: number,
  maxTokens: number
): Promise<SearchResponse> {
  const batches = await settleSearchBatches(
    searchQueryList.map(searchQuery =>
      searchWithMiniMaxWebSearch(searchQuery, numResults)
    )
  )
  const citations = rankAndDedupeSources(
    batches
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
      }),
    resolvedQuery,
    numResults
  )

  const answer = await synthesizeAnswerFromResults(
    resolvedQuery,
    citations,
    maxTokens,
    classification
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
  maxTokens: number
): Promise<SearchResponse> {
  const resultBatches = await settleSearchBatches(
    searchQueryList.map(searchQuery =>
      searchDuckDuckGo(searchQuery, numResults)
    )
  )
  const citations = rankAndDedupeSources(
    resultBatches.flat(),
    resolvedQuery,
    numResults
  )
  const answer = await synthesizeAnswerFromResults(
    resolvedQuery,
    citations,
    maxTokens,
    classification
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
  const results = await Promise.allSettled(searches)
  const fulfilled = results
    .filter((result): result is PromiseFulfilledResult<T[]> => {
      if (result.status === 'rejected') {
        console.warn('Search query failed:', result.reason)
        return false
      }
      return true
    })
    .map(result => result.value)

  if (fulfilled.length === 0) {
    const firstError = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    throw firstError?.reason ?? new Error('All search queries failed')
  }

  return fulfilled
}

async function searchDuckDuckGo(
  query: string,
  numResults: number
): Promise<SearchResult[]> {
  const response = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
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

async function synthesizeAnswerFromResults(
  query: string,
  citations: SearchResult[],
  maxTokens: number,
  classification: QueryClassification
): Promise<string> {
  if (citations.length === 0) {
    return 'No search results were available.'
  }

  if (!MINIMAX_API_KEY) {
    return citations
      .map(citation => `${citation.title}: ${citation.snippet}`.trim())
      .join('\n')
  }

  const context = citations
    .map(
      (citation, index) =>
        `[source_${index + 1}]\nTitle: ${citation.title}\nURL: ${citation.url}\nAuthority: ${citation.qualityScore ?? 0}/100\nSnippet: ${citation.snippet}`
    )
    .join('\n\n')

  const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MINIMAX_CHAT_MODEL,
      max_tokens: Math.min(maxTokens, 1200),
      messages: [
        {
          role: 'system',
          content:
            'You are Brok, a fast answer engine. Answer using only the provided search results. Start with the direct answer. Keep simple factual questions concise. Use bullets or tables only when they make the answer clearer. Cite factual claims with [1], [2], etc. matching the source order. Mention uncertainty when evidence is weak. For investment, medical, legal, or other high-stakes advice, do not decide for the user; give a brief due-diligence checklist. End naturally without generic "let me know" language.'
        },
        {
          role: 'user',
          content: `Question: ${query}\nQuestion type: ${classification.type}\nSearch decision: ${classification.reason}\n\nSearch results:\n${context}`
        }
      ]
    })
  })

  if (!response.ok) {
    return citations
      .map(citation => `${citation.title}: ${citation.snippet}`.trim())
      .join('\n')
  }

  const data = await response.json()
  return stripThinkingBlocks(
    data.choices?.[0]?.message?.content || 'No answer generated.'
  )
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
  const freshness = recencyDays ? ` within ${recencyDays} days` : ''
  const inferredDomains = domains?.length ? [] : extractDomainsFromQuery(query)
  const domainList = domains?.length ? domains : inferredDomains
  const domainHint = domainList?.length
    ? ` site:${domainList.join(' OR site:')}`
    : ''
  const queries = [
    `${resolved}${freshness}${domainHint}`,
    `${resolved} official docs primary source${freshness}${domainHint}`,
    `${resolved} analysis comparison${freshness}${domainHint}`,
    `${resolved} latest updates${freshness}${domainHint}`,
    `${resolved} examples implementation${freshness}${domainHint}`
  ]

  if (depth === 'lite') {
    return [queries[0]]
  }

  return [...new Set(queries)].slice(0, limit)
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
          return !/\.(png|jpe?g|gif|webp|pdf|zip|txt|md)$/i.test(domain)
        })
    )
  ).slice(0, 3)
}

export function rankAndDedupeSources(
  sources: Array<Omit<SearchResult, 'id' | 'qualityScore'> | SearchResult>,
  query: string,
  limit: number
): SearchResult[] {
  const seen = new Set<string>()
  return sources
    .filter(source => {
      const key = normalizeSourceKey(source.url)
      if (!key || seen.has(key)) return false
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

  return Math.max(
    0,
    Math.min(100, 20 + relevance + authority + freshness + spamPenalty)
  )
}

function scoreAuthority(host: string) {
  if (!host) return 0
  if (/\b(gov|edu)\b/.test(host)) return 35
  if (
    /(^|\.)((docs|developer|platform|support)\.|github\.com|arxiv\.org|openai\.com|minimax\.io|anthropic\.com|google\.com|microsoft\.com|apple\.com)/i.test(
      host
    )
  ) {
    return 30
  }
  if (
    /(reuters|associatedpress|apnews|bloomberg|ft\.com|wsj\.com|theverge|techcrunch)/i.test(
      host
    )
  ) {
    return 22
  }
  return 8
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
