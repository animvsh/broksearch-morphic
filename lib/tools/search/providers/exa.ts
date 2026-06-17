import Exa from 'exa-js'

import { SearchResults } from '@/lib/types'

import {
  BaseSearchProvider,
  getProviderFetchTimeoutMs,
  SearchProviderOptions
} from './base'

export class ExaSearchProvider extends BaseSearchProvider {
  async search(
    query: string,
    maxResults: number = 10,
    _searchDepth: 'basic' | 'advanced' = 'basic',
    includeDomains: string[] = [],
    excludeDomains: string[] = [],
    options?: SearchProviderOptions
  ): Promise<SearchResults> {
    const apiKey = process.env.EXA_API_KEY
    this.validateApiKey(apiKey, 'EXA')

    const exa = new Exa(apiKey)
    const timeoutMs = getProviderFetchTimeoutMs(options?.timeoutMs)
    const exaResults = await withTimeoutAndAbort(
      exa.searchAndContents(query, {
        highlights: true,
        livecrawlTimeout: timeoutMs,
        numResults: maxResults,
        includeDomains,
        excludeDomains
      }),
      timeoutMs,
      options?.signal
    )

    return {
      results: exaResults.results.map((result: any) => ({
        title: result.title,
        url: result.url,
        content: result.highlight || result.text
      })),
      query,
      images: [],
      number_of_results: exaResults.results.length
    }
  }
}

function withTimeoutAndAbort<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new Error('Search aborted'))
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let abortHandler: (() => void) | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new DOMException(
          `Exa search timed out after ${timeoutMs}ms`,
          'TimeoutError'
        )
      )
    }, timeoutMs)
  })

  const abortPromise = new Promise<never>((_, reject) => {
    abortHandler = () => reject(signal?.reason ?? new Error('Search aborted'))
    signal?.addEventListener('abort', abortHandler, { once: true })
  })

  return Promise.race([promise, timeoutPromise, abortPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
    if (abortHandler) signal?.removeEventListener('abort', abortHandler)
  })
}
