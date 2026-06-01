import type { SearchResultItem, SearchResults } from '@/lib/types'
import type { UIMessage } from '@/lib/types/ai'
/**
 * Validate if a string is a valid URL
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Extract citation maps from a message's tool parts
 * Returns a map of toolCallId to citation map
 */
export function extractCitationMaps(
  message: UIMessage
): Record<string, Record<number, SearchResultItem>> {
  const citationMaps: Record<string, Record<number, SearchResultItem>> = {}

  if (!message.parts) return citationMaps

  message.parts.forEach((part: any) => {
    // Check for search tool output
    if (
      part.type === 'tool-search' &&
      part.state === 'output-available' &&
      part.output &&
      part.toolCallId
    ) {
      const searchResults = part.output as SearchResults
      if (searchResults.citationMap) {
        // Store citation map with toolCallId as key
        citationMaps[part.toolCallId] = searchResults.citationMap
      }
    }
  })

  return citationMaps
}

/**
 * Extract citation maps from multiple messages
 * Returns a combined map of toolCallId to citation map
 */
export function extractCitationMapsFromMessages(
  messages: UIMessage[]
): Record<string, Record<number, SearchResultItem>> {
  const combinedCitationMaps: Record<
    string,
    Record<number, SearchResultItem>
  > = {}

  messages.forEach(message => {
    const messageCitationMaps = extractCitationMaps(message)
    // Merge citation maps from this message
    Object.assign(combinedCitationMaps, messageCitationMaps)
  })

  return combinedCitationMaps
}

/**
 * Process citations in content, replacing [number](#toolCallId) with [number](url).
 * If metadata is missing, keep the visible citation number instead of deleting it.
 */
export function processCitations(
  content: string,
  citationMaps: Record<string, Record<number, SearchResultItem>>
): string {
  if (!content) return ''

  const hasCitationMaps = citationMaps && Object.keys(citationMaps).length > 0

  return content.replace(
    /\[\s*(\d+)\s*\]\(#([^)]+)\)/g,
    (_match, num, rawReference) => {
      const visibleNum = parseInt(num, 10)
      const [toolCallId, sourceIndex] = String(rawReference).split(':')
      const citationNum = parseInt(sourceIndex || num, 10)

      if (
        isNaN(visibleNum) ||
        isNaN(citationNum) ||
        citationNum < 1 ||
        citationNum > 100
      ) {
        return `[${num}]`
      }

      if (!hasCitationMaps) {
        return `[${visibleNum}]`
      }

      const citationMap = citationMaps[toolCallId]
      if (!citationMap) {
        return `[${visibleNum}]`
      }

      const citation = citationMap[citationNum]
      if (!citation || !isValidUrl(citation.url)) {
        return `[${visibleNum}]`
      }

      return `[${visibleNum}](${encodeURI(citation.url)})`
    }
  )
}
