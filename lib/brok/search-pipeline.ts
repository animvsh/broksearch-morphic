import { parse } from 'node-html-parser'

import {
  MINIMAX_API_KEY,
  MINIMAX_BASE_URL,
  MINIMAX_CHAT_MODEL,
  MINIMAX_MODEL
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
}

export interface SearchResponse {
  answer: string
  citations: SearchResult[]
  searchQueries: number
  tokensUsed: number
}

export interface SearchRequest {
  query: string
  depth: 'lite' | 'standard' | 'deep'
  recencyDays?: number
  domains?: string[]
}

const SEARCH_CONFIG = {
  lite: { sources: 3, maxTokens: 8000 },
  standard: { sources: 8, maxTokens: 16000 },
  deep: { sources: 20, maxTokens: 32000 }
}

export async function runSearchPipeline(
  request: SearchRequest
): Promise<SearchResponse> {
  const config = SEARCH_CONFIG[request.depth]

  try {
    return await runMiniMaxWebSearch(
      request.query,
      config.sources,
      config.maxTokens,
      request.recencyDays
    )
  } catch (error) {
    console.warn('Falling back to HTML search pipeline:', error)
    return runHtmlSearchPipeline(
      request.query,
      config.sources,
      config.maxTokens
    )
  }
}

async function runMiniMaxWebSearch(
  query: string,
  numResults: number,
  maxTokens: number,
  recencyDays?: number
): Promise<SearchResponse> {
  const searchQuery = recencyDays
    ? `${query} within ${recencyDays} days`
    : query
  const webResults = await searchWithMiniMaxWebSearch(searchQuery, numResults)
  const citations = webResults
    .filter(result => result.link)
    .slice(0, numResults)
    .map((result, index): SearchResult => {
      const url = result.link || ''
      return {
        id: `src_${index + 1}`,
        title: result.title || 'Untitled',
        url,
        publisher: getHost(url),
        snippet: [result.snippet, result.date ? `Date: ${result.date}` : '']
          .filter(Boolean)
          .join('\n'),
        retrievedAt: new Date().toISOString()
      }
    })

  const answer = await synthesizeAnswerFromResults(query, citations, maxTokens)

  return {
    answer,
    citations,
    searchQueries: 1,
    tokensUsed: Math.round(
      (answer.length + JSON.stringify(citations).length) / 4
    )
  }
}

interface MiniMaxSearchResult {
  id: string
  title: string
  url: string
  publisher?: string
  snippet: string
  retrievedAt: string
}

interface MiniMaxWebSearchResponse {
  results: MiniMaxSearchResult[]
  answer: string
  tokensUsed: number
}

async function runMiniMaxNativeSearch(
  query: string,
  numResults: number,
  maxTokens: number,
  recencyDays?: number
): Promise<SearchResponse> {
  if (!MINIMAX_API_KEY) {
    throw new Error('Brok provider API key not configured')
  }

  const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      messages: [
        {
          role: 'user',
          content: query
        }
      ],
      tools: [
        {
          type: 'web_search',
          web_search: {
            top_n: numResults
          }
        }
      ],
      tool_choice: {
        type: 'web_search',
        web_search: {
          top_n: numResults
        }
      },
      max_tokens: maxTokens,
      ...(recencyDays ? { metadata: { recency_days: recencyDays } } : {})
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Brok web search error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  const searchResults: MiniMaxSearchResult[] = []
  let answer = ''

  if (data.choices?.[0]?.message?.tool_calls) {
    const toolCall = data.choices[0].message.tool_calls[0]
    if (toolCall.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments)
      if (parsed.result?.web_pages) {
        searchResults.push(
          ...parsed.result.web_pages.map((page: any, index: number) => ({
            id: `src_${index + 1}`,
            title: page.title || 'Untitled',
            url: page.url,
            publisher: page.publisher,
            snippet: page.description || page.snippet || '',
            retrievedAt: new Date().toISOString()
          }))
        )
      }
      if (parsed.result?.answer) {
        answer = parsed.result.answer
      }
    }
  }

  if (
    searchResults.length === 0 &&
    data.citations &&
    Array.isArray(data.citations)
  ) {
    searchResults.push(
      ...data.citations.map((cite: any, index: number) => ({
        id: `src_${index + 1}`,
        title: cite.title || 'Untitled',
        url: cite.url,
        publisher: cite.publisher,
        snippet: cite.snippet || cite.description || '',
        retrievedAt: new Date().toISOString()
      }))
    )
  }

  if (!answer && data.choices?.[0]?.message?.content) {
    answer = data.choices[0].message.content
  }

  const tokensUsed =
    data.usage?.total_tokens ||
    Math.round((answer.length + JSON.stringify(searchResults).length) / 4)

  return {
    answer: answer || 'No answer generated.',
    citations: searchResults.slice(0, numResults),
    searchQueries: 1,
    tokensUsed
  }
}

async function runHtmlSearchPipeline(
  query: string,
  numResults: number,
  maxTokens: number
): Promise<SearchResponse> {
  const citations = await searchDuckDuckGo(query, numResults)
  const answer = await synthesizeAnswerFromResults(query, citations, maxTokens)

  return {
    answer,
    citations,
    searchQueries: 1,
    tokensUsed: Math.round(
      (answer.length + JSON.stringify(citations).length) / 4
    )
  }
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
  maxTokens: number
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
      citation =>
        `Title: ${citation.title}\nURL: ${citation.url}\nSnippet: ${citation.snippet}`
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
            'Answer using only the provided search results. Be concise and mention uncertainty when the evidence is weak.'
        },
        {
          role: 'user',
          content: `Question: ${query}\n\nSearch results:\n${context}`
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
