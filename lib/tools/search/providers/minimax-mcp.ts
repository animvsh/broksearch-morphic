import { searchWithMiniMaxMcp } from '@/lib/brok/minimax-web-mcp'
import { SearchResults } from '@/lib/types'
import { sanitizeUrl } from '@/lib/utils'

import { SearchProvider } from './base'

export class MiniMaxMcpSearchProvider implements SearchProvider {
  async search(
    query: string,
    maxResults: number = 10,
    _searchDepth: 'basic' | 'advanced' = 'basic',
    includeDomains: string[] = [],
    excludeDomains: string[] = []
  ): Promise<SearchResults> {
    const results = await searchWithMiniMaxMcp(query)
    const includeSet = new Set(
      includeDomains.map(domain => domain.toLowerCase())
    )
    const excludeSet = new Set(
      excludeDomains.map(domain => domain.toLowerCase())
    )

    const filteredResults = results
      .filter(result => result.link)
      .filter(result => {
        const host = getHost(result.link || '')
        if (!host) return false
        if (includeSet.size > 0 && !matchesDomain(host, includeSet)) {
          return false
        }
        return !matchesDomain(host, excludeSet)
      })
      .slice(0, maxResults)
      .map(result => ({
        title: result.title || 'Untitled',
        url: sanitizeUrl(result.link || ''),
        content: [result.snippet, result.date ? `Date: ${result.date}` : '']
          .filter(Boolean)
          .join('\n')
      }))

    return {
      results: filteredResults,
      images: [],
      query,
      number_of_results: filteredResults.length
    }
  }
}

function getHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return undefined
  }
}

function matchesDomain(host: string, domains: Set<string>): boolean {
  for (const domain of domains) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      return true
    }
  }
  return false
}
