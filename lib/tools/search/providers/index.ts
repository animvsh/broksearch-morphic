import { SearchProvider } from './base'
import { BraveSearchProvider } from './brave'
import { BrokWebSearchProvider } from './brok'
import { ExaSearchProvider } from './exa'
import { FirecrawlSearchProvider } from './firecrawl'
import { SearXNGSearchProvider } from './searxng'
import { TavilySearchProvider } from './tavily'

export type SearchProviderType =
  | 'brok'
  | 'brok-mcp'
  | 'tavily'
  | 'exa'
  | 'searxng'
  | 'firecrawl'
  | 'brave'
export const DEFAULT_PROVIDER: SearchProviderType = 'brok'

export function createSearchProvider(
  type?: SearchProviderType
): SearchProvider {
  const providerType =
    type || (process.env.SEARCH_API as SearchProviderType) || DEFAULT_PROVIDER

  switch (providerType) {
    case 'brok':
    case 'brok-mcp':
      return new BrokWebSearchProvider()
    case 'tavily':
      return new TavilySearchProvider()
    case 'exa':
      return new ExaSearchProvider()
    case 'searxng':
      return new SearXNGSearchProvider()
    case 'brave':
      return new BraveSearchProvider()
    case 'firecrawl':
      return new FirecrawlSearchProvider()
    default:
      // Default to TavilySearchProvider if an unknown provider is specified
      return new TavilySearchProvider()
  }
}

export { BraveSearchProvider } from './brave'
export { BrokWebSearchProvider } from './brok'
export type { ExaSearchProvider } from './exa'
export type { FirecrawlSearchProvider } from './firecrawl'
export { SearXNGSearchProvider } from './searxng'
export { TavilySearchProvider } from './tavily'
export type { SearchProvider }
