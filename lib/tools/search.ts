import { tool, UIToolInvocation } from 'ai'

import { getSearchSchemaForModel } from '@/lib/schema/search'
import { SearchResultItem, SearchResults } from '@/lib/types'
import {
  getGeneralSearchProviderType,
  getSearchToolDescription
} from '@/lib/utils/search-config'
import { getBaseUrlString } from '@/lib/utils/url'

import {
  createSearchProvider,
  DEFAULT_PROVIDER,
  SearchProviderType
} from './search/providers'

const SEARCH_UNAVAILABLE_MESSAGE =
  'Search is temporarily unavailable for this request. Try again in a moment, or narrow the query to a specific source or domain.'

async function runSearchProvider({
  searchAPI,
  filledQuery,
  effectiveMaxResults,
  effectiveSearchDepthForAPI,
  includeDomains,
  excludeDomains,
  type,
  contentTypes
}: {
  searchAPI: SearchProviderType
  filledQuery: string
  effectiveMaxResults: number
  effectiveSearchDepthForAPI: 'basic' | 'advanced'
  includeDomains: string[]
  excludeDomains: string[]
  type: 'general' | 'optimized'
  contentTypes: Array<'web' | 'video' | 'image' | 'news'>
}): Promise<SearchResults> {
  if (searchAPI === 'searxng' && effectiveSearchDepthForAPI === 'advanced') {
    const baseUrl = await getBaseUrlString()

    const response = await fetch(`${baseUrl}/api/advanced-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: filledQuery,
        maxResults: effectiveMaxResults,
        searchDepth: effectiveSearchDepthForAPI,
        includeDomains,
        excludeDomains
      })
    })
    if (!response.ok) {
      throw new Error(
        `Advanced search API error: ${response.status} ${response.statusText}`
      )
    }
    return response.json()
  }

  const searchProvider = createSearchProvider(searchAPI)

  if (searchAPI === 'brave') {
    return searchProvider.search(
      filledQuery,
      effectiveMaxResults,
      effectiveSearchDepthForAPI,
      includeDomains,
      excludeDomains,
      {
        type,
        content_types: contentTypes
      }
    )
  }

  return searchProvider.search(
    filledQuery,
    effectiveMaxResults,
    effectiveSearchDepthForAPI,
    includeDomains,
    excludeDomains
  )
}

function fallbackSearchProvider(searchAPI: SearchProviderType) {
  return searchAPI === DEFAULT_PROVIDER ? null : DEFAULT_PROVIDER
}

/**
 * Creates a search tool with the appropriate schema for the given model.
 */
export function createSearchTool(fullModel: string) {
  return tool({
    description: getSearchToolDescription(),
    inputSchema: getSearchSchemaForModel(fullModel),
    async *execute(
      {
        query,
        type = 'optimized',
        content_types = ['web'],
        max_results = 20,
        search_depth = 'basic', // Default for standard schema
        include_domains = [],
        exclude_domains = []
      },
      context
    ) {
      // Yield initial searching state
      yield {
        state: 'searching' as const,
        query
      }
      // Keep search responsive for short requests while still returning enough
      // context for citation quality.
      const minResults = 8
      const effectiveMaxResults = Math.max(
        max_results || minResults,
        minResults
      )
      const effectiveSearchDepth = search_depth as 'basic' | 'advanced'

      // Use the original query as is - any provider-specific handling will be done in the provider
      const filledQuery = query
      let searchResult: SearchResults

      // Determine which provider to use based on type
      let searchAPI: SearchProviderType
      if (type === 'general') {
        // Try to use dedicated general search provider
        const generalProvider = getGeneralSearchProviderType()
        if (generalProvider) {
          searchAPI = generalProvider
        } else {
          // Fallback to primary provider (optimized search provider)
          searchAPI =
            (process.env.SEARCH_API as SearchProviderType) || DEFAULT_PROVIDER
          console.log(
            `[Search] type="general" requested but no dedicated provider available, using optimized search provider: ${searchAPI}`
          )
        }
      } else {
        // For 'optimized', use the configured provider
        searchAPI =
          (process.env.SEARCH_API as SearchProviderType) || DEFAULT_PROVIDER
      }

      const effectiveSearchDepthForAPI =
        searchAPI === 'searxng' &&
        process.env.SEARXNG_DEFAULT_DEPTH === 'advanced'
          ? 'advanced'
          : effectiveSearchDepth || 'basic'

      console.log(
        `Using search API: ${searchAPI}, Type: ${type}, Search Depth: ${effectiveSearchDepthForAPI}`
      )

      try {
        searchResult = await runSearchProvider({
          searchAPI,
          filledQuery,
          effectiveMaxResults,
          effectiveSearchDepthForAPI,
          includeDomains: include_domains,
          excludeDomains: exclude_domains,
          type: type as 'general' | 'optimized',
          contentTypes: content_types as Array<
            'web' | 'video' | 'image' | 'news'
          >
        })
      } catch (error) {
        console.error(`${searchAPI} search API error:`, error)
        const fallbackProvider = fallbackSearchProvider(searchAPI)

        if (fallbackProvider) {
          try {
            console.warn(
              `Falling back from ${searchAPI} to ${fallbackProvider} search provider`
            )
            searchResult = await runSearchProvider({
              searchAPI: fallbackProvider,
              filledQuery,
              effectiveMaxResults,
              effectiveSearchDepthForAPI: effectiveSearchDepth,
              includeDomains: include_domains,
              excludeDomains: exclude_domains,
              type: 'optimized',
              contentTypes: ['web']
            })
          } catch (fallbackError) {
            console.error(
              `${fallbackProvider} search API error:`,
              fallbackError
            )
            searchResult = {
              results: [],
              images: [],
              query: filledQuery,
              number_of_results: 0,
              error: SEARCH_UNAVAILABLE_MESSAGE
            }
          }
        } else {
          searchResult = {
            results: [],
            images: [],
            query: filledQuery,
            number_of_results: 0,
            error: SEARCH_UNAVAILABLE_MESSAGE
          }
        }
      }

      // Add citation mapping and toolCallId to search results
      if (searchResult.results && searchResult.results.length > 0) {
        const citationMap: Record<number, SearchResultItem> = {}
        searchResult.results.forEach((result, index) => {
          citationMap[index + 1] = result // Citation numbers start at 1
        })
        searchResult.citationMap = citationMap
      }

      // Add toolCallId from context
      if (context?.toolCallId) {
        searchResult.toolCallId = context.toolCallId
      }

      console.log('completed search')

      // Yield final results with complete state
      yield {
        state: 'complete' as const,
        ...searchResult
      }
    }
  })
}

// Default export for backward compatibility, using a default model
export const searchTool = createSearchTool('openai:gpt-4o-mini')

// Export type for UI tool invocation
export type SearchUIToolInvocation = UIToolInvocation<typeof searchTool>

export async function search(
  query: string,
  maxResults: number = 10,
  searchDepth: 'basic' | 'advanced' = 'basic',
  includeDomains: string[] = [],
  excludeDomains: string[] = []
): Promise<SearchResults> {
  const result = await searchTool.execute?.(
    {
      query,
      type: 'general',
      content_types: ['web'],
      max_results: maxResults,
      search_depth: searchDepth,
      include_domains: includeDomains,
      exclude_domains: excludeDomains
    },
    {
      toolCallId: 'search',
      messages: []
    }
  )

  if (!result) {
    return { results: [], images: [], query, number_of_results: 0 }
  }

  // Handle AsyncIterable case
  if (Symbol.asyncIterator in result) {
    // Collect all results from the async iterable
    let searchResults: SearchResults | null = null
    for await (const chunk of result) {
      // Only assign when we get the complete result
      if ('state' in chunk && chunk.state === 'complete') {
        const { state, ...rest } = chunk
        searchResults = rest as SearchResults
      }
    }
    return (
      searchResults ?? { results: [], images: [], query, number_of_results: 0 }
    )
  }

  return result as SearchResults
}
