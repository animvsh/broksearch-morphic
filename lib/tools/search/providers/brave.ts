import {
  SearchImageItem,
  SearchResults,
  SerperSearchResultItem
} from '@/lib/types'

import {
  BaseSearchProvider,
  createProviderAbortSignal,
  SearchProviderOptions
} from './base'

interface BraveWebResult {
  title?: string
  description?: string
  url: string
}

interface BraveVideoResult {
  title?: string
  description?: string
  url?: string
  thumbnail?: {
    src?: string
  }
  video?: {
    duration?: string
  }
  duration?: string
  date?: string
  publisher?: string
}

interface BraveImageResult {
  title?: string
  source?: string
  url?: string
  thumbnail?: {
    src?: string
  }
  properties?: {
    thumbnail?: string
    width?: number
    height?: number
  }
  width?: number
  height?: number
}

export class BraveSearchProvider extends BaseSearchProvider {
  private apiKey: string | undefined

  constructor() {
    super()
    this.apiKey = process.env.BRAVE_SEARCH_API_KEY
  }

  private getImageThumbnailUrl(result: BraveImageResult): string {
    return (
      result.thumbnail?.src ?? result.properties?.thumbnail ?? result.url ?? ''
    )
  }

  async search(
    query: string,
    maxResults: number = 10,
    searchDepth?: 'basic' | 'advanced',
    includeDomains?: string[],
    excludeDomains?: string[],
    options?: SearchProviderOptions
  ): Promise<SearchResults> {
    if (!this.apiKey) {
      throw new Error('Brave Search API key not configured')
    }

    const contentTypes = options?.content_types || ['web']
    const results: SearchResults = {
      results: [],
      images: [],
      videos: [],
      query,
      number_of_results: 0
    }

    // Execute searches in parallel for each content type
    const promises: Promise<void>[] = []

    if (contentTypes.includes('web')) {
      promises.push(this.searchWeb(query, maxResults, results, options))
    }

    if (contentTypes.includes('video')) {
      promises.push(this.searchVideos(query, maxResults, results, options))
    }

    if (contentTypes.includes('image')) {
      promises.push(this.searchImages(query, maxResults, results, options))
    }

    await Promise.all(promises)

    // Update total count
    results.number_of_results = results.results.length

    return results
  }

  private async searchWeb(
    query: string,
    maxResults: number,
    results: SearchResults,
    options?: SearchProviderOptions
  ): Promise<void> {
    const abortContext = createProviderAbortSignal('Brave web', options)
    try {
      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
          query
        )}&count=${maxResults}`,
        {
          signal: abortContext.signal,
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': this.apiKey!
          }
        }
      )

      if (!response.ok) {
        console.error(`Brave web search failed: ${response.statusText}`)
        throw new Error('Search failed')
      }

      const data = await response.json()
      results.results = (data.web?.results || [])
        .slice(0, maxResults)
        .map((result: BraveWebResult) => ({
          title: result.title || 'No title',
          description: result.description || 'No description available',
          url: result.url
        }))
    } catch (error) {
      console.error('Brave web search error:', error)
    } finally {
      abortContext.cleanup()
    }
  }

  private async searchVideos(
    query: string,
    maxResults: number,
    results: SearchResults,
    options?: SearchProviderOptions
  ): Promise<void> {
    const abortContext = createProviderAbortSignal('Brave video', options)
    try {
      const response = await fetch(
        `https://api.search.brave.com/res/v1/videos/search?q=${encodeURIComponent(
          query
        )}&count=${maxResults}`,
        {
          signal: abortContext.signal,
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': this.apiKey!
          }
        }
      )

      if (!response.ok) {
        console.error(`Brave video search failed: ${response.statusText}`)
        throw new Error('Search failed')
      }

      const data = await response.json()

      // Convert to SerperSearchResultItem format for compatibility
      results.videos = (data.results || []).slice(0, maxResults).map(
        (result: BraveVideoResult, index: number) =>
          ({
            title: result.title ?? 'No title',
            link: result.url ?? '',
            snippet: result.description ?? 'No description available',
            imageUrl: result.thumbnail?.src ?? '',
            duration: result.video?.duration ?? result.duration ?? '',
            source: result.publisher ?? '',
            channel: result.publisher ?? '',
            date: result.date ?? '',
            position: index
          }) as SerperSearchResultItem
      )
    } catch (error) {
      console.error('Brave video search error:', error)
      results.videos = []
    } finally {
      abortContext.cleanup()
    }
  }

  private async searchImages(
    query: string,
    maxResults: number,
    results: SearchResults,
    options?: SearchProviderOptions
  ): Promise<void> {
    const abortContext = createProviderAbortSignal('Brave image', options)
    try {
      const response = await fetch(
        `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(
          query
        )}&count=${maxResults}`,
        {
          signal: abortContext.signal,
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': this.apiKey!
          }
        }
      )

      if (!response.ok) {
        console.error(`Brave image search failed: ${response.statusText}`)
        throw new Error('Search failed')
      }

      const data = await response.json()
      results.images = (data.results || []).slice(0, maxResults).map(
        (result: BraveImageResult) =>
          ({
            title: result.title || 'No title',
            link: result.url || result.source || '',
            thumbnailUrl: this.getImageThumbnailUrl(result)
          }) as SearchImageItem
      )
    } catch (error) {
      console.error('Brave image search error:', error)
      results.images = []
    } finally {
      abortContext.cleanup()
    }
  }
}
