import { SearchResults } from '@/lib/types'

export interface SearchProviderOptions {
  type?: 'general' | 'optimized'
  content_types?: Array<'web' | 'video' | 'image' | 'news'>
  signal?: AbortSignal
  timeoutMs?: number
}

export interface SearchProvider {
  search(
    query: string,
    maxResults: number,
    searchDepth: 'basic' | 'advanced',
    includeDomains: string[],
    excludeDomains: string[],
    options?: SearchProviderOptions
  ): Promise<SearchResults>
}

const DEFAULT_PROVIDER_FETCH_TIMEOUT_MS = 8_000

export function getProviderFetchTimeoutMs(timeoutMs?: number): number {
  if (Number.isFinite(timeoutMs) && timeoutMs && timeoutMs > 0) {
    return timeoutMs
  }

  const configured = Number.parseInt(
    process.env.SEARCH_PROVIDER_TIMEOUT_MS || '',
    10
  )
  if (Number.isFinite(configured) && configured > 0) return configured

  return DEFAULT_PROVIDER_FETCH_TIMEOUT_MS
}

export function createProviderAbortSignal(
  providerName: string,
  options?: Pick<SearchProviderOptions, 'signal' | 'timeoutMs'>
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timeoutMs = getProviderFetchTimeoutMs(options?.timeoutMs)
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const abortFromParent = () => {
    controller.abort(options?.signal?.reason)
  }

  if (options?.signal?.aborted) {
    abortFromParent()
  } else {
    options?.signal?.addEventListener('abort', abortFromParent, { once: true })
  }

  timeoutId = setTimeout(() => {
    controller.abort(
      new DOMException(
        `${providerName} search timed out after ${timeoutMs}ms`,
        'TimeoutError'
      )
    )
  }, timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeoutId) clearTimeout(timeoutId)
      options?.signal?.removeEventListener('abort', abortFromParent)
    }
  }
}

export abstract class BaseSearchProvider implements SearchProvider {
  abstract search(
    query: string,
    maxResults: number,
    searchDepth: 'basic' | 'advanced',
    includeDomains: string[],
    excludeDomains: string[],
    options?: SearchProviderOptions
  ): Promise<SearchResults>

  protected validateApiKey(
    key: string | undefined,
    providerName: string
  ): asserts key is string {
    if (!key) {
      throw new Error(
        `${providerName}_API_KEY is not set in the environment variables`
      )
    }
  }

  protected validateApiUrl(
    url: string | undefined,
    providerName: string
  ): void {
    if (!url) {
      throw new Error(
        `${providerName}_API_URL is not set in the environment variables`
      )
    }
  }
}
