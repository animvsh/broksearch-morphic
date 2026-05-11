import { SearchProvider } from './base'
import { BraveSearchProvider } from './brave'
import { ExaSearchProvider } from './exa'
import { FirecrawlSearchProvider } from './firecrawl'
import { MiniMaxMcpSearchProvider } from './minimax-mcp'
import { SearXNGSearchProvider } from './searxng'
import { TavilySearchProvider } from './tavily'

export type SearchProviderType =
  | 'minimax-mcp'
  | 'tavily'
  | 'exa'
  | 'searxng'
  | 'firecrawl'
  | 'brave'
export const DEFAULT_PROVIDER: SearchProviderType = 'minimax-mcp'

export function createSearchProvider(
  type?: SearchProviderType
): SearchProvider {
  const providerType =
    type || (process.env.SEARCH_API as SearchProviderType) || DEFAULT_PROVIDER

  switch (providerType) {
    case 'minimax-mcp':
      return new MiniMaxMcpSearchProvider()
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
export type { ExaSearchProvider } from './exa'
export type { FirecrawlSearchProvider } from './firecrawl'
export { MiniMaxMcpSearchProvider } from './minimax-mcp'
export { SearXNGSearchProvider } from './searxng'
export { TavilySearchProvider } from './tavily'
export type { SearchProvider }
